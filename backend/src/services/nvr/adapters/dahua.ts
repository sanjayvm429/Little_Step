import { INvrAdapter, NvrCredentials, DiscoveredChannel, RecordingSegment, PlaybackSession, NvrUnsupportedError } from '../types.js';
import { createNvrHttpClient, rtspBase } from '../http.js';

/**
 * Dahua adapter — uses CGI API (HTTP Digest auth).
 * Docs: https://www.dahuasecurity.com/support/Quick_Start/CCTV_Series/Network_Camera/NVR
 *
 * - Device info: GET /cgi-bin/magicBox.cgi?action=getSystemInfo
 * - Channel discovery: GET /cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle
 * - Live RTSP: rtsp://host:554/cam/realmonitor?channel={n}&subtype=0
 * - Playback: CGI recordFileSearch / recordPlay — proxied via MediaMTX when possible.
 */
export class DahuaAdapter implements INvrAdapter {
  readonly brand = 'dahua' as const;
  readonly supportsDiscovery = true;
  readonly supportsPlayback = true;

  async testConnection(creds: NvrCredentials) {
    const client = createNvrHttpClient(creds);
    const res = await client.get('/cgi-bin/magicBox.cgi?action=getSystemInfo');
    if (res.status === 200 && res.data) {
      const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
      return {
        ok: true,
        message: 'Connected to Dahua device',
        deviceInfo: { raw: text.slice(0, 500) },
      };
    }
    if (res.status === 401) return { ok: false, message: 'Authentication failed. If your NVR uses Digest Auth, please use Direct RTSP mode and enter the full RTSP URL manually.' };
    if (res.status === 0) return { ok: false, message: 'Cannot reach the NVR. Check IP, port, and network connectivity.' };
    return { ok: false, message: `Dahua device unreachable or unexpected response (HTTP ${res.status}). Try Direct RTSP mode with manual RTSP URLs.` };
  }

  async discoverCameras(creds: NvrCredentials): Promise<DiscoveredChannel[]> {
    const client = createNvrHttpClient(creds);
    const res = await client.get('/cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle');
    if (res.status === 401) throw new Error('Authentication failed — check username/password');
    if (res.status !== 200 || !res.data) {
      throw new Error(`Camera discovery failed (HTTP ${res.status})`);
    }
    const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    const channels: DiscoveredChannel[] = [];
    // Parse table.ChannelTitle[i] entries
    const re = /table\.ChannelTitle\[(\d+)\](?:\.Name)?=([^\r\n]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const num = parseInt(m[1], 10);
      const name = m[2].trim().replace(/^"|"$/g, '');
      channels.push({
        channelNumber: num,
        name: name || `Camera ${num}`,
        status: 'unknown',
        rtspUrl: this.getLiveStreamUrl(creds, num),
      });
    }
    if (channels.length === 0) {
      // Fallback: probe channels 1..16 via configManager
      for (let i = 1; i <= 16; i++) {
        const probe = await client.get(`/cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle[${i}]`);
        if (probe.status === 200 && probe.data) {
          channels.push({
            channelNumber: i,
            name: `Camera ${i}`,
            status: 'unknown',
            rtspUrl: this.getLiveStreamUrl(creds, i),
          });
        }
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
    const res = await client.get(`/cgi-bin/videoFile.cgi?${params.toString()}`);
    if (res.status === 401) throw new Error('Authentication failed');
    if (res.status !== 200) throw new Error(`Recording search failed (HTTP ${res.status})`);
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
    return segments;
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
