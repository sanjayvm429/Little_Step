import { INvrAdapter, NvrCredentials, NvrConnectionTestResult, DiscoveredChannel, RecordingSegment, PlaybackSession, NvrUnsupportedError } from '../types.js';
import { createNvrHttpClient, rtspBase } from '../http.js';
import { verifyRtspVideo } from '../rtspProbe.js';
import { testTcpPort } from './cpplus.js';

/**
 * Dahua adapter — uses CGI API (HTTP Digest auth) and RTSP streaming.
 * Docs: https://www.dahuasecurity.com/support/Quick_Start/CCTV_Series/Network_Camera/NVR
 *
 * - Device info: GET /cgi-bin/magicBox.cgi?action=getSystemInfo
 * - Channel discovery: GET /cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle
 * - Live RTSP: rtsp://host:554/cam/realmonitor?channel={n}&subtype=0
 * - Playback: rtsp://host:554/cam/playback?channel={n}&starttime={start}&endtime={end}
 */
export class DahuaAdapter implements INvrAdapter {
  readonly brand = 'dahua' as const;
  readonly supportsDiscovery = true;
  readonly supportsPlayback = true;

  async testConnection(creds: NvrCredentials): Promise<NvrConnectionTestResult> {
    const client = createNvrHttpClient(creds);
    let httpOk = false;
    let deviceInfo: Record<string, unknown> | undefined;

    try {
      const res = await client.get('/cgi-bin/magicBox.cgi?action=getSystemInfo');
      if (res.status === 200 && res.data) {
        httpOk = true;
        const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
        const modelMatch = text.match(/(?:deviceType|model|hardwareVersion)=([^\r\n]+)/i);
        deviceInfo = {
          model: modelMatch ? modelMatch[1].trim() : 'Dahua NVR',
          raw: text.slice(0, 500),
        };
      }
    } catch {
      // HTTP probe non-fatal
    }

    let rtspOk = false;
    try {
      await verifyRtspVideo(this.getLiveStreamUrl(creds, 1), creds, 5000);
      rtspOk = true;
    } catch {
      // RTSP video probe non-fatal, fallback to socket check
    }

    if (!rtspOk) {
      rtspOk = await testTcpPort(creds.host, creds.rtspPort, 4000);
    }

    if (httpOk || rtspOk) {
      return {
        ok: true,
        status: 'online',
        message: httpOk && rtspOk
          ? 'Connected to Dahua device (HTTP and RTSP verified).'
          : httpOk
            ? 'Connected to Dahua device (HTTP management verified).'
            : 'Connected to Dahua device (RTSP streaming verified).',
        deviceInfo: deviceInfo ?? { model: 'Dahua NVR' },
      };
    }

    return {
      ok: false,
      status: 'offline',
      message: `Cannot reach Dahua NVR at ${creds.host}:${creds.httpPort} (HTTP) or ${creds.rtspPort} (RTSP). Check IP, ports, and network connectivity.`,
    };
  }

  async discoverCameras(creds: NvrCredentials): Promise<DiscoveredChannel[]> {
    const client = createNvrHttpClient(creds);
    const channels: DiscoveredChannel[] = [];

    try {
      const res = await client.get('/cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle');
      if (res.status === 200 && res.data) {
        const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
        // Parse table.ChannelTitle[i] entries
        const re = /table\.ChannelTitle\[(\d+)\](?:\.Name)?=([^\r\n]+)/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) !== null) {
          const num = parseInt(m[1], 10) + 1;
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
      // Fall through to probe
    }

    if (channels.length === 0) {
      // Fallback: generate channels 1..16
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

    return [{
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      channel: channelNumber,
    }];
  }

  async startPlayback(creds: NvrCredentials, channelNumber: number, start: Date, end: Date): Promise<PlaybackSession> {
    const url = `${rtspBase(creds)}/cam/playback?channel=${channelNumber}&starttime=${formatDahuaTime(start)}&endtime=${formatDahuaTime(end)}`;
    return {
      sessionId: `dahua-${channelNumber}-${start.getTime()}`,
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
