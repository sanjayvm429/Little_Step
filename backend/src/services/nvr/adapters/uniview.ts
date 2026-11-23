import { INvrAdapter, NvrCredentials, NvrConnectionTestResult, DiscoveredChannel, RecordingSegment, PlaybackSession } from '../types.js';
import { createNvrHttpClient, rtspBase } from '../http.js';
import { verifyRtspVideo } from '../rtspProbe.js';
import { testTcpPort } from './cpplus.js';

/**
 * Uniview (UNV) adapter.
 * Uniview RTSP format: rtsp://host:554/unicast/c{channel}/s0/live (main) or s1/live (sub)
 * Playback format: rtsp://host:554/unicast/c{channel}/s0/playback?starttime=...&endtime=...
 */
export class UniviewAdapter implements INvrAdapter {
  readonly brand = 'uniview' as const;
  readonly supportsDiscovery = true;
  readonly supportsPlayback = true;

  async testConnection(creds: NvrCredentials): Promise<NvrConnectionTestResult> {
    const client = createNvrHttpClient(creds);
    let httpOk = false;
    let deviceInfo: Record<string, unknown> | undefined;

    try {
      const res = await client.get('/LAPI/V1.0/System/DeviceInfo');
      if (res.status === 200 && res.data) {
        httpOk = true;
        const d = res.data as Record<string, any>;
        deviceInfo = {
          model: d?.Response?.Data?.DeviceType || 'Uniview NVR',
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
      rtspOk = await testTcpPort(creds.host, creds.rtspPort, 4000);
    }

    if (httpOk || rtspOk) {
      return {
        ok: true,
        status: 'online',
        message: 'Connected to Uniview NVR device.',
        deviceInfo: deviceInfo ?? { model: 'Uniview NVR' },
      };
    }

    return {
      ok: false,
      status: 'offline',
      message: `Could not reach Uniview NVR at ${creds.host}:${creds.rtspPort}. Check IP, RTSP port, and credentials.`,
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
    return `${rtspBase(creds)}/unicast/c${channelNumber}/s0/live`;
  }

  async searchRecordings(_creds: NvrCredentials, channelNumber: number, start: Date, end: Date): Promise<RecordingSegment[]> {
    return [{
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      channel: channelNumber,
    }];
  }

  async startPlayback(creds: NvrCredentials, channelNumber: number, start: Date, end: Date): Promise<PlaybackSession> {
    const formatTime = (d: Date) => d.toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const url = `${rtspBase(creds)}/unicast/c${channelNumber}/s0/playback?starttime=${formatTime(start)}&endtime=${formatTime(end)}`;
    return {
      sessionId: `unv-${channelNumber}-${start.getTime()}`,
      streamUrl: url,
    };
  }

  async stopPlayback(sessionId: string): Promise<void> {
    void sessionId;
  }
}
