import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer, Server, Socket } from 'node:net';
import { createServer as createHttpServer, Server as HttpServer } from 'node:http';
import { after, test } from 'node:test';
import {
  buildHikvisionSearchXml,
  formatHikvisionRtspTime,
  HikvisionAdapter,
  parseHikvisionSearchResponse,
} from '../src/services/nvr/adapters/hikvision.js';

const httpDigestChallenge = 'Digest realm="mock-http", nonce="http-nonce", qop="auth", algorithm=MD5';
const rtspDigestChallenge = 'Digest realm="mock-rtsp", nonce="rtsp-nonce", algorithm=MD5';
const username = 'test-user';
const password = 'p@ss:word';
const servers: Array<Server | HttpServer> = [];

after(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

test('Hikvision connection test authenticates HTTP and receives RTSP video packets', async () => {
  let httpDigestSeen = false;
  const httpServer = createHttpServer((request, response) => {
    const validDigest = request.headers.authorization &&
      verifyDigest(request.headers.authorization, request.method ?? 'GET', request.url ?? '/', 'mock-http', 'http-nonce', 'auth');
    if (!validDigest) {
      response.writeHead(401, { 'WWW-Authenticate': httpDigestChallenge });
      response.end();
      return;
    }

    httpDigestSeen = true;
    response.writeHead(200, { 'Content-Type': 'application/xml' });
    response.end('<DeviceInfo><deviceName>Test NVR</deviceName><model>DS-7608</model></DeviceInfo>');
  });
  servers.push(httpServer);
  const httpPort = await listen(httpServer);

  const rtspRequests: string[] = [];
  const rtspServer = createServer((socket) => handleRtspClient(socket, rtspRequests));
  servers.push(rtspServer);
  const rtspPort = await listen(rtspServer);

  const result = await new HikvisionAdapter().testConnection({
    host: '127.0.0.1',
    httpPort,
    rtspPort,
    username,
    password,
  });

  assert.equal(result.ok, true, result.message);
  assert.equal(result.status, 'online');
  assert.equal(result.deviceInfo?.model, 'DS-7608');
  assert.equal(httpDigestSeen, true);
  assert.ok(
    rtspRequests.some((request) => request.startsWith('DESCRIBE rtsp://127.0.0.1:')),
    `Unexpected RTSP requests: ${JSON.stringify(rtspRequests)}`,
  );
  assert.ok(rtspRequests.some((request) => request.startsWith('SETUP rtsp://127.0.0.1:')));
  assert.ok(rtspRequests.some((request) => request.startsWith('PLAY rtsp://127.0.0.1:')));
  const authorizedRequests = rtspRequests.filter((request) => request.includes('Authorization: Digest '));
  assert.ok(authorizedRequests.length >= 3);
  assert.ok(rtspRequests.every((request) => !request.includes('p@ss:word')));
});

test('Hikvision discovery parses XML input-proxy channels and decodes names', async () => {
  const httpServer = createHttpServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/xml' });
    response.end(
      '<InputProxyChannelList>' +
      '<InputProxyChannel><id>1</id><name>Lobby &amp; Hall</name><enabled>true</enabled></InputProxyChannel>' +
      '<InputProxyChannel><id>2</id><name>Playroom</name><enabled>false</enabled></InputProxyChannel>' +
      '</InputProxyChannelList>',
    );
  });
  servers.push(httpServer);
  const httpPort = await listen(httpServer);

  const channels = await new HikvisionAdapter().discoverCameras({
    host: '127.0.0.1',
    httpPort,
    rtspPort: 554,
  });

  assert.deepEqual(channels, [
    { channelNumber: 1, name: 'Lobby & Hall', status: 'unknown' },
    { channelNumber: 2, name: 'Playroom', status: 'offline' },
  ]);
});

test('Hikvision discovery maps streaming IDs to physical camera channels', async () => {
  const httpServer = createHttpServer((request, response) => {
    if (request.url === '/ISAPI/ContentMgmt/InputProxy/channels') {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/xml' });
    response.end(
      '<StreamingChannelList>' +
      '<StreamingChannel><id>101</id><name>Camera One Main</name></StreamingChannel>' +
      '<StreamingChannel><id>102</id><name>Camera One Sub</name></StreamingChannel>' +
      '<StreamingChannel><id>201</id><name>Camera Two Main</name></StreamingChannel>' +
      '</StreamingChannelList>',
    );
  });
  servers.push(httpServer);
  const httpPort = await listen(httpServer);

  const channels = await new HikvisionAdapter().discoverCameras({
    host: '127.0.0.1',
    httpPort,
    rtspPort: 554,
  });

  assert.deepEqual(channels.map(({ channelNumber, name }) => ({ channelNumber, name })), [
    { channelNumber: 1, name: 'Camera One Main' },
    { channelNumber: 2, name: 'Camera Two Main' },
  ]);
});

test('Hikvision recording search uses the ISAPI XML schema and main-stream track ID', () => {
  const start = new Date('2026-11-14T09:00:00.000Z');
  const end = new Date('2026-11-14T10:00:00.000Z');
  const xml = buildHikvisionSearchXml(3, start, end);

  assert.match(xml, /<trackID>301<\/trackID>/);
  assert.match(xml, /xmlns="http:\/\/www\.hikvision\.com\/ver20\/XMLSchema"/);
  assert.match(xml, /<startTime>2026-11-14T09:00:00Z<\/startTime>/);
  assert.match(xml, /<endTime>2026-11-14T10:00:00Z<\/endTime>/);
  assert.match(xml, /<metadataDescriptor>\/\/recordType\.meta\.std-cgi\.com<\/metadataDescriptor>/);
  assert.match(xml, /<CMSearchDescription\b/);
  assert.equal(formatHikvisionRtspTime(start), '20261114T090000Z');
});

test('Hikvision playback uses the channel main-stream track and requested time interval', async () => {
  const session = await new HikvisionAdapter().startPlayback(
    { host: '127.0.0.1', httpPort: 80, rtspPort: 554, username, password },
    3,
    new Date('2026-11-14T09:00:00.000Z'),
    new Date('2026-11-14T10:00:00.000Z'),
  );

  assert.match(session.streamUrl ?? '', /\/Streaming\/tracks\/301\?/);
  assert.match(session.streamUrl ?? '', /starttime=20261114T090000Z/);
  assert.match(session.streamUrl ?? '', /endtime=20261114T100000Z/);
});

test('Hikvision recording search parses matching XML recording segments', () => {
  const segments = parseHikvisionSearchResponse(
    '<CMSearchResult><matchList>' +
    '<searchMatchItem><trackID>301</trackID><timeSpan>' +
    '<startTime>2026-11-14T09:05:00Z</startTime><endTime>2026-11-14T09:10:00Z</endTime>' +
    '</timeSpan></searchMatchItem></matchList></CMSearchResult>',
    3,
  );

  assert.deepEqual(segments, [{
    startTime: '2026-11-14T09:05:00.000Z',
    endTime: '2026-11-14T09:10:00.000Z',
    channel: 3,
  }]);
});

function listen(server: Server | HttpServer): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Mock server did not bind to a TCP port'));
        return;
      }
      resolve(address.port);
    });
  });
}

function handleRtspClient(socket: Socket, requests: string[]): void {
  let buffer = Buffer.alloc(0);
  socket.on('data', (data) => {
    buffer = Buffer.concat([buffer, data]);
    while (true) {
      const end = buffer.indexOf('\r\n\r\n');
      if (end < 0) return;

      const message = buffer.subarray(0, end).toString('ascii');
      buffer = buffer.subarray(end + 4);
      requests.push(message);
      const [requestLine, ...headerLines] = message.split('\r\n');
      const [method, uri] = requestLine.split(' ');
      const cseq = headerLines.find((line) => /^CSeq:/i.test(line))?.split(':')[1].trim() ?? '1';
      const authorization = headerLines.find((line) => /^Authorization:/i.test(line))?.replace(/^Authorization:\s*/i, '');
      const validDigest = authorization && verifyDigest(authorization, method, uri, 'mock-rtsp', 'rtsp-nonce');
      if (!validDigest) {
        writeResponse(socket, `RTSP/1.0 401 Unauthorized\r\nCSeq: ${cseq}\r\nWWW-Authenticate: ${rtspDigestChallenge}\r\nContent-Length: 0\r\n\r\n`);
      } else if (method === 'DESCRIBE') {
        const body = 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=Mock NVR\r\nt=0 0\r\nm=video 0 RTP/AVP 96\r\na=control:trackID=1\r\n';
        const requestUri = requestLine.split(' ')[1];
        const contentBase = requestUri.endsWith('/') ? requestUri : `${requestUri}/`;
        writeResponse(socket, `RTSP/1.0 200 OK\r\nCSeq: ${cseq}\r\nContent-Type: application/sdp\r\nContent-Base: ${contentBase}\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
      } else if (method === 'SETUP') {
        writeResponse(socket, `RTSP/1.0 200 OK\r\nCSeq: ${cseq}\r\nSession: mock-session\r\nTransport: RTP/AVP/TCP;unicast;interleaved=0-1\r\nContent-Length: 0\r\n\r\n`);
      } else if (method === 'PLAY') {
        const rtp = Buffer.alloc(16);
        rtp[0] = 0x80;
        const frameHeader = Buffer.from([0x24, 0, 0, rtp.length]);
        writeResponse(socket, `RTSP/1.0 200 OK\r\nCSeq: ${cseq}\r\nContent-Length: 0\r\n\r\n`);
        socket.write(Buffer.concat([frameHeader, rtp]));
      } else {
        writeResponse(socket, `RTSP/1.0 405 Method Not Allowed\r\nCSeq: ${cseq}\r\nContent-Length: 0\r\n\r\n`);
      }
    }
  });
}

function writeResponse(socket: Socket, response: string): void {
  socket.write(response);
}

function verifyDigest(
  authorization: string,
  method: string,
  uri: string,
  realm: string,
  nonce: string,
  qop?: string,
): boolean {
  const fields: Record<string, string> = {};
  const fieldPattern = /(\w+)=(?:"((?:\\.|[^"])*)"|([^,\s]+))/g;
  for (const match of authorization.replace(/^Digest\s+/i, '').matchAll(fieldPattern)) {
    fields[match[1].toLowerCase()] = (match[2] ?? match[3]).replace(/\\(["\\])/g, '$1');
  }

  if (
    fields.username !== username ||
    fields.realm !== realm ||
    fields.nonce !== nonce ||
    fields.uri !== uri ||
    !fields.response
  ) {
    return false;
  }

  const ha1 = md5(`${username}:${realm}:${password}`);
  const ha2 = md5(`${method}:${uri}`);
  const expected = qop
    ? md5(`${ha1}:${nonce}:${fields.nc}:${fields.cnonce}:${qop}:${ha2}`)
    : md5(`${ha1}:${nonce}:${ha2}`);
  return fields.response === expected && (qop === undefined || fields.qop === qop);
}

function md5(value: string): string {
  return createHash('md5').update(value, 'utf8').digest('hex');
}
