import net from 'node:net';
import { NvrCredentials } from './types.js';
import { AuthHandler, createAuthHandler } from './httpAuth.js';

interface RtspResponse {
  statusCode: number;
  statusLine: string;
  headers: Map<string, string[]>;
  body: string;
}

class RtspConnection {
  private buffer = Buffer.alloc(0);
  private readonly waiters = new Set<() => void>();
  private closed = false;
  private socketError?: Error;

  constructor(private readonly socket: net.Socket) {
    socket.on('data', (data) => {
      this.buffer = Buffer.concat([this.buffer, data]);
      this.wakeWaiters();
    });
    socket.on('error', (error) => {
      this.socketError = error;
      this.wakeWaiters();
    });
    socket.on('close', () => {
      this.closed = true;
      this.wakeWaiters();
    });
  }

  async connect(host: string, port: number, timeoutMs: number): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.socket.destroy();
        onError(new Error('RTSP connection timed out'));
      }, timeoutMs);
      const onError = (error: Error) => {
        clearTimeout(timer);
        this.socket.off('connect', onConnect);
        this.socket.off('timeout', onTimeout);
        reject(error);
      };
      const onConnect = () => {
        clearTimeout(timer);
        this.socket.off('error', onError);
        this.socket.off('timeout', onTimeout);
        resolve();
      };
      const onTimeout = () => onError(new Error('RTSP connection timed out'));

      this.socket.once('error', onError);
      this.socket.once('connect', onConnect);
      this.socket.once('timeout', onTimeout);
      this.socket.connect(port, host);
    });
  }

  async request(
    method: string,
    uri: string,
    headers: Record<string, string>,
    timeoutMs: number,
    credentials: NvrCredentials,
    authHandler?: AuthHandler,
  ): Promise<{ response: RtspResponse; authHandler?: AuthHandler }> {
    let response = await this.sendRequest(method, uri, headers, timeoutMs, authHandler);
    if (response.statusCode !== 401) return { response, authHandler };

    const challenges = response.headers.get('www-authenticate') ?? [];
    authHandler = createAuthHandler(challenges, credentials.username, credentials.password);
    if (!authHandler) return { response };

    response = await this.sendRequest(method, uri, headers, timeoutMs, authHandler);
    return { response, authHandler };
  }

  async readVideoPacket(interleavedChannel: number, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (true) {
      if (this.socketError) throw new Error('RTSP connection failed while waiting for video data');
      if (this.closed) throw new Error('RTSP connection closed before video data arrived');

      if (this.buffer[0] === 0x24 && this.buffer.length >= 4) {
        const channel = this.buffer[1];
        const packetLength = this.buffer.readUInt16BE(2);
        const frameLength = packetLength + 4;
        if (this.buffer.length >= frameLength) {
          const packet = this.buffer.subarray(4, frameLength);
          this.buffer = this.buffer.subarray(frameLength);
          if (channel === interleavedChannel && packet.length >= 12 && (packet[0] >> 6) === 2) {
            return;
          }
          continue;
        }
      } else if (this.buffer.length > 0) {
        const response = this.tryReadResponse();
        if (response) continue;
      }

      await this.waitForData(deadline);
    }
  }

  close(): void {
    this.socket.destroy();
  }

  private async sendRequest(
    method: string,
    uri: string,
    headers: Record<string, string>,
    timeoutMs: number,
    authHandler?: AuthHandler,
  ): Promise<RtspResponse> {
    const cseq = (this.nextCseq++).toString();
    const authorization = authHandler?.authorization(method, uri);
    const lines = [
      `${method} ${uri} RTSP/1.0`,
      `CSeq: ${cseq}`,
      'User-Agent: LittleSteps-NVR-Connection-Test',
      ...Object.entries(headers).map(([name, value]) => `${name}: ${value}`),
    ];
    if (authorization) lines.push(`Authorization: ${authorization}`);
    this.socket.write(`${lines.join('\r\n')}\r\n\r\n`);
    return this.readResponse(Date.now() + timeoutMs);
  }

  private nextCseq = 1;

  private async readResponse(deadline: number): Promise<RtspResponse> {
    while (true) {
      if (this.socketError) throw new Error('RTSP connection failed while waiting for a response');
      if (this.closed) throw new Error('RTSP connection closed before responding');

      if (this.buffer[0] === 0x24 && this.buffer.length >= 4) {
        const frameLength = this.buffer.readUInt16BE(2) + 4;
        if (this.buffer.length >= frameLength) {
          this.buffer = this.buffer.subarray(frameLength);
          continue;
        }
      } else {
        const response = this.tryReadResponse();
        if (response) return response;
      }

      await this.waitForData(deadline);
    }
  }

  private tryReadResponse(): RtspResponse | undefined {
    const headerEnd = this.buffer.indexOf('\r\n\r\n');
    if (headerEnd < 0) return undefined;

    const headerText = this.buffer.subarray(0, headerEnd).toString('ascii');
    const lines = headerText.split('\r\n');
    const statusLine = lines.shift() ?? '';
    const statusMatch = statusLine.match(/^RTSP\/\d(?:\.\d)?\s+(\d{3})\b/);
    if (!statusMatch) throw new Error('NVR returned an invalid RTSP response');

    const headers = new Map<string, string[]>();
    for (const line of lines) {
      const separator = line.indexOf(':');
      if (separator <= 0) continue;
      const name = line.slice(0, separator).trim().toLowerCase();
      const value = line.slice(separator + 1).trim();
      headers.set(name, [...(headers.get(name) ?? []), value]);
    }

    const contentLength = Number(headers.get('content-length')?.[0] ?? 0);
    if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
      throw new Error('NVR returned an invalid RTSP content length');
    }
    const responseEnd = headerEnd + 4 + contentLength;
    if (this.buffer.length < responseEnd) return undefined;

    const body = this.buffer.subarray(headerEnd + 4, responseEnd).toString('utf8');
    this.buffer = this.buffer.subarray(responseEnd);
    return {
      statusCode: Number(statusMatch[1]),
      statusLine,
      headers,
      body,
    };
  }

  private waitForData(deadline: number): Promise<void> {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return Promise.reject(new Error('RTSP request timed out'));

    return new Promise<void>((resolve, reject) => {
      const wake = () => {
        clearTimeout(timer);
        this.waiters.delete(wake);
        resolve();
      };
      const timer = setTimeout(() => {
        this.waiters.delete(wake);
        reject(new Error('RTSP request timed out'));
      }, remaining);
      this.waiters.add(wake);
    });
  }

  private wakeWaiters(): void {
    for (const wake of this.waiters) wake();
  }
}

export async function verifyRtspVideo(
  rtspUrl: string,
  credentials: NvrCredentials,
  timeoutMs = 8000,
): Promise<void> {
  const source = new URL(rtspUrl);
  if (source.protocol !== 'rtsp:') throw new Error('The generated stream URL is not RTSP');

  const host = source.hostname;
  const port = Number(source.port || credentials.rtspPort || 554);
  source.username = '';
  source.password = '';
  source.hash = '';
  const requestUri = source.toString();

  const socket = new net.Socket();
  socket.setNoDelay(true);
  const connection = new RtspConnection(socket);

  try {
    await connection.connect(host, port, timeoutMs);

    let authHandler: AuthHandler | undefined;
    const describe = await connection.request(
      'DESCRIBE',
      requestUri,
      { Accept: 'application/sdp' },
      timeoutMs,
      credentials,
      authHandler,
    );
    authHandler = describe.authHandler;
    if (describe.response.statusCode === 401) throw new Error('RTSP authentication failed');
    if (describe.response.statusCode !== 200) {
      throw new Error(`RTSP DESCRIBE failed (${describe.response.statusLine})`);
    }
    if (!/^application\/sdp\b/i.test(describe.response.headers.get('content-type')?.[0] ?? '')) {
      throw new Error('RTSP endpoint did not return an SDP media description');
    }

    const videoTrack = findVideoTrack(describe.response.body);
    if (!videoTrack) throw new Error('RTSP endpoint did not advertise a video track');

    const contentBase = describe.response.headers.get('content-base')?.[0] ??
      describe.response.headers.get('content-location')?.[0] ??
      `${requestUri}/`;
    const baseUrl = new URL(contentBase);
    if (!baseUrl.pathname.endsWith('/')) baseUrl.pathname += '/';
    const trackUri = videoTrack === '*' ? requestUri : new URL(videoTrack, baseUrl).toString();
    const setup = await connection.request(
      'SETUP',
      trackUri,
      { Transport: 'RTP/AVP/TCP;unicast;interleaved=0-1' },
      timeoutMs,
      credentials,
      authHandler,
    );
    authHandler = setup.authHandler;
    if (setup.response.statusCode === 401) throw new Error('RTSP authentication failed during stream setup');
    if (setup.response.statusCode !== 200) {
      throw new Error(`RTSP SETUP failed (${setup.response.statusLine})`);
    }

    const session = setup.response.headers.get('session')?.[0]?.split(';')[0];
    if (!session) throw new Error('NVR did not return an RTSP session');

    const play = await connection.request(
      'PLAY',
      requestUri,
      { Session: session },
      timeoutMs,
      credentials,
      authHandler,
    );
    if (play.response.statusCode === 401) throw new Error('RTSP authentication failed during playback');
    if (play.response.statusCode !== 200) {
      throw new Error(`RTSP PLAY failed (${play.response.statusLine})`);
    }

    await connection.readVideoPacket(0, timeoutMs);
  } finally {
    connection.close();
  }
}

function findVideoTrack(sdp: string): string | undefined {
  let inVideoSection = false;
  for (const line of sdp.split(/\r?\n/)) {
    if (line.startsWith('m=')) {
      inVideoSection = line.startsWith('m=video ');
      continue;
    }
    if (inVideoSection && line.startsWith('a=control:')) {
      return line.slice('a=control:'.length).trim();
    }
  }
  return undefined;
}
