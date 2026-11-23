import { INvrAdapter, NvrCredentials, NvrConnectionTestResult, DiscoveredChannel, RecordingSegment, PlaybackSession, NvrUnsupportedError } from '../types.js';
import { testTcpPort } from './cpplus.js';

/**
 * Direct RTSP adapter — used for "Connect Cameras Directly Using RTSP" mode.
 * Each camera carries its own full RTSP URL.
 */
export class DirectRtspAdapter implements INvrAdapter {
  readonly brand = 'other' as const;
  readonly supportsDiscovery = false;
  readonly supportsPlayback = true;

  async testConnection(creds: NvrCredentials): Promise<NvrConnectionTestResult> {
    const ok = await testTcpPort(creds.host, creds.rtspPort, 5000);
    if (ok) {
      return {
        ok: true,
        status: 'online',
        message: `RTSP port ${creds.rtspPort} on ${creds.host} is open and reachable.`,
      };
    }
    return {
      ok: false,
      status: 'offline',
      message: `Connection to ${creds.host}:${creds.rtspPort} timed out or was refused.`,
    };
  }

  async discoverCameras(_creds: NvrCredentials): Promise<DiscoveredChannel[]> {
    throw new NvrUnsupportedError('Discovery is not available in Direct RTSP mode. Enter camera RTSP URLs directly.');
  }

  getLiveStreamUrl(_creds: NvrCredentials, _channelNumber: number): string {
    throw new NvrUnsupportedError('Direct RTSP cameras store their own URL; use rtspUrlEnc instead.');
  }

  async searchRecordings(_creds: NvrCredentials, channelNumber: number, start: Date, end: Date): Promise<RecordingSegment[]> {
    return [{
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      channel: channelNumber,
    }];
  }

  async startPlayback(_creds: NvrCredentials, channelNumber: number, start: Date, end: Date): Promise<PlaybackSession> {
    return {
      sessionId: `direct-${channelNumber}-${start.getTime()}`,
    };
  }

  async stopPlayback(_sessionId: string): Promise<void> {
    void _sessionId;
  }
}
