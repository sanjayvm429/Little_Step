import { INvrAdapter, NvrCredentials, NvrConnectionTestResult, DiscoveredChannel, RecordingSegment, PlaybackSession } from '../types.js';
import { rtspBase } from '../http.js';
import { testTcpPort } from './cpplus.js';
import { verifyRtspVideo } from '../rtspProbe.js';

/**
 * Generic adapter for brands without a dedicated implementation (Axis, Hanwha, Bosch, TVT, Honeywell, Other).
 * - testConnection: checks RTSP/HTTP reachability and video probe.
 * - discoverCameras: generates standard channels with common RTSP patterns.
 * - Live stream: standard RTSP URL.
 * - Playback: supported.
 */
export class GenericAdapter implements INvrAdapter {
  readonly brand = 'other' as const;
  readonly supportsDiscovery = true;
  readonly supportsPlayback = true;

  async testConnection(creds: NvrCredentials): Promise<NvrConnectionTestResult> {
    let rtspOk = false;
    try {
      await verifyRtspVideo(this.getLiveStreamUrl(creds, 1), creds, 4000);
      rtspOk = true;
    } catch {
      // RTSP video probe non-fatal, fallback to socket check
    }

    if (!rtspOk) {
      rtspOk = await testTcpPort(creds.host, creds.rtspPort, 4000);
    }

    if (rtspOk) {
      return {
        ok: true,
        status: 'online',
        message: `Successfully connected to NVR at ${creds.host}:${creds.rtspPort} (RTSP reachable).`,
        deviceInfo: { model: 'Generic / ONVIF NVR' },
      };
    }

    const httpOk = await testTcpPort(creds.host, creds.httpPort, 3000);
    if (httpOk) {
      return {
        ok: true,
        status: 'online',
        message: `Connected to NVR HTTP port ${creds.httpPort}.`,
        deviceInfo: { model: 'Generic NVR' },
      };
    }

    return {
      ok: false,
      status: 'offline',
      message: `Could not connect to ${creds.host} on RTSP port ${creds.rtspPort} or HTTP port ${creds.httpPort}. Check IP and network reachability.`,
    };
  }

  async discoverCameras(creds: NvrCredentials): Promise<DiscoveredChannel[]> {
    const channels: DiscoveredChannel[] = [];
    for (let i = 1; i <= 16; i++) {
      channels.push({
        channelNumber: i,
        name: `Camera ${i}`,
        status: 'unknown',
        rtspUrl: this.getLiveStreamUrl(creds, i),
      });
    }
    return channels;
  }

  getLiveStreamUrl(creds: NvrCredentials, channelNumber: number): string {
    return `${rtspBase(creds)}/cam/realmonitor?channel=${channelNumber}&subtype=0`;
  }

  async searchRecordings(_creds: NvrCredentials, channelNumber: number, start: Date, end: Date): Promise<RecordingSegment[]> {
    return [{
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      channel: channelNumber,
    }];
  }

  async startPlayback(creds: NvrCredentials, channelNumber: number, start: Date, end: Date): Promise<PlaybackSession> {
    const url = `${rtspBase(creds)}/cam/playback?channel=${channelNumber}&starttime=${start.getTime()}&endtime=${end.getTime()}`;
    return {
      sessionId: `generic-${channelNumber}-${start.getTime()}`,
      streamUrl: url,
    };
  }

  async stopPlayback(sessionId: string): Promise<void> {
    void sessionId;
  }
}
