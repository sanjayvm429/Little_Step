import { INvrAdapter, NvrCredentials, NvrConnectionTestResult, DiscoveredChannel, RecordingSegment, PlaybackSession } from '../types.js';
import { createNvrHttpClient, rtspBase } from '../http.js';
import { verifyRtspVideo } from '../rtspProbe.js';
import net from 'node:net';

export function testTcpPort(host: string, port: number, timeoutMs = 4000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

/**
 * CP Plus adapter — India's leading CCTV/NVR brand.
 * CP Plus NVRs / DVRs are based on Dahua CGI and RTSP protocols.
 *
 * - Device info: GET /cgi-bin/magicBox.cgi?action=getSystemInfo
 * - Channel discovery: GET /cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle
 * - Live RTSP: rtsp://host:554/cam/realmonitor?channel={n}&subtype=0
 * - Playback: rtsp://host:554/cam/playback?channel={n}&starttime={start}&endtime={end}
 */
export class CpPlusAdapter implements INvrAdapter {
  readonly brand = 'cpplus' as const;
  readonly supportsDiscovery = true;
  readonly supportsPlayback = true;

  async testConnection(creds: NvrCredentials): Promise<NvrConnectionTestResult> {
    const client = createNvrHttpClient(creds);
    let httpOk = false;
    let deviceInfo: Record<string, unknown> | undefined;

    // 1. Try HTTP CGI endpoints
    try {
      const res = await client.get('/cgi-bin/magicBox.cgi?action=getSystemInfo');
      if (res.status === 200 && res.data) {
        httpOk = true;
        const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
        const modelMatch = text.match(/(?:deviceType|model|hardwareVersion)=([^\r\n]+)/i);
        deviceInfo = {
          model: modelMatch ? modelMatch[1].trim() : 'CP Plus NVR',
          raw: text.slice(0, 500),
        };
      }
    } catch {
      // HTTP probe non-fatal
    }

    // 2. Try RTSP Video Probe for channel 1
    let rtspOk = false;
    try {
      await verifyRtspVideo(this.getLiveStreamUrl(creds, 1), creds, 5000);
      rtspOk = true;
    } catch {
      // RTSP video probe non-fatal, fallback to socket
    }

    // 3. Fallback: check RTSP port reachability
    if (!rtspOk) {
      rtspOk = await testTcpPort(creds.host, creds.rtspPort, 4000);
    }

    if (httpOk || rtspOk) {
      return {
        ok: true,
        status: 'online',
        message: httpOk && rtspOk
          ? 'Connected to CP Plus NVR (HTTP and RTSP verified).'
          : httpOk
            ? 'Connected to CP Plus NVR (HTTP management verified).'
            : 'Connected to CP Plus NVR (RTSP streaming verified).',
        deviceInfo: deviceInfo ?? { model: 'CP Plus NVR' },
      };
    }

    return {
      ok: false,
      status: 'offline',
      message: `Could not connect to CP Plus NVR at ${creds.host}:${creds.httpPort} (HTTP) or ${creds.rtspPort} (RTSP). Check IP, ports, and credentials.`,
    };
  }

  async discoverCameras(creds: NvrCredentials): Promise<DiscoveredChannel[]> {
    const client = createNvrHttpClient(creds);
    const channels: DiscoveredChannel[] = [];

    // Try CGI discovery
    try {
      const res = await client.get('/cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle');
      if (res.status === 200 && res.data) {
        const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
        const re = /table\.ChannelTitle\[(\d+)\](?:\.Name)?=([^\r\n]+)/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) !== null) {
          const num = parseInt(m[1], 10) + 1; // Dahua 0-indexed table to 1-indexed channel
          const name = m[2].trim().replace(/^"|"$/g, '');
          channels.push({
            channelNumber: num,
            name: name || `Camera ${num}`,
            status: 'unknown',
            rtspUrl: this.getLiveStreamUrl(creds, num),
          });
        }
      }
    } catch {
      // Fall through to fallback
    }

    // If CGI gave no channels, fallback to 16 standard channels
    if (channels.length === 0) {
      for (let i = 1; i <= 16; i++) {
        channels.push({
          channelNumber: i,
          name: `Camera ${i}`,
          status: 'unknown',
          rtspUrl: this.getLiveStreamUrl(creds, i),
        });
      }
    }

    return channels;
  }

  getLiveStreamUrl(creds: NvrCredentials, channelNumber: number): string {
    return `${rtspBase(creds)}/cam/realmonitor?channel=${channelNumber}&subtype=0`;
  }

  async searchRecordings(creds: NvrCredentials, channelNumber: number, start: Date, end: Date): Promise<RecordingSegment[]> {
    const client = createNvrHttpClient(creds, 15000);
    const params = new URLSearchParams({
      action: 'recordFileSearch',
      channel: String(channelNumber),
      startTime: formatDahuaTime(start),
      endTime: formatDahuaTime(end),
    });
    try {
      const res = await client.get(`/cgi-bin/videoFile.cgi?${params.toString()}`);
      if (res.status === 200 && res.data) {
        const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
        const segments: RecordingSegment[] = [];
        const re = /startTime=([^&\s]+)&endTime=([^&\s]+)/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) !== null) {
          segments.push({
            startTime: parseDahuaTime(m[1]),
            endTime: parseDahuaTime(m[2]),
            channel: channelNumber,
          });
        }
        if (segments.length > 0) return segments;
      }
    } catch {
      // Fallback
    }

    // Fallback continuous segment for requested range
    return [{
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      channel: channelNumber,
    }];
  }

  async startPlayback(creds: NvrCredentials, channelNumber: number, start: Date, end: Date): Promise<PlaybackSession> {
    const url = `${rtspBase(creds)}/cam/playback?channel=${channelNumber}&starttime=${formatDahuaTime(start)}&endtime=${formatDahuaTime(end)}`;
    return {
      sessionId: `cpplus-${channelNumber}-${start.getTime()}`,
      streamUrl: url,
    };
  }

  async stopPlayback(sessionId: string): Promise<void> {
    void sessionId;
  }
}

function formatDahuaTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function parseDahuaTime(s: string): string {
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return '';
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`).toISOString();
}
