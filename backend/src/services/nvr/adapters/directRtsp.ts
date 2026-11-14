import { INvrAdapter, NvrCredentials, NvrConnectionTestResult, DiscoveredChannel, RecordingSegment, PlaybackSession, NvrUnsupportedError } from '../types.js';
import { rtspBase } from '../http.js';

/**
 * Direct RTSP adapter — used for "Connect Cameras Directly Using RTSP" mode.
 * No discovery, no playback. Each camera carries its own full RTSP URL.
 */
export class DirectRtspAdapter implements INvrAdapter {
  readonly brand = 'other' as const;
  readonly supportsDiscovery = false;
  readonly supportsPlayback = false;

  async testConnection(creds: NvrCredentials) {
    const net = await import('net');
    return new Promise<NvrConnectionTestResult>((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(5000);
      socket.once('connect', () => {
        socket.destroy();
        resolve({
          ok: false,
          status: 'connection_error',
          message: `RTSP port ${creds.rtspPort} is reachable, but a camera stream URL is required to verify video.`,
        });
      });
      socket.once('timeout', () => {
        socket.destroy();
        resolve({ ok: false, status: 'offline', message: `Connection to ${creds.host}:${creds.rtspPort} timed out` });
      });
      socket.once('error', (err) => {
        socket.destroy();
        resolve({ ok: false, status: 'offline', message: `Connection failed: ${err.message}` });
      });
      socket.connect(creds.rtspPort, creds.host);
    });
  }

  async discoverCameras(_creds: NvrCredentials): Promise<DiscoveredChannel[]> {
    throw new NvrUnsupportedError('Discovery is not available in Direct RTSP mode.');
  }

  getLiveStreamUrl(_creds: NvrCredentials, _channelNumber: number): string {
    throw new NvrUnsupportedError('Direct RTSP cameras store their own URL; use rtspUrlEnc instead.');
  }

  async searchRecordings(_creds: NvrCredentials, _channelNumber: number, _start: Date, _end: Date): Promise<RecordingSegment[]> {
    throw new NvrUnsupportedError('Playback requires a recording source; a live RTSP URL alone cannot retrieve recordings.');
  }

  async startPlayback(_creds: NvrCredentials, _channelNumber: number, _start: Date, _end: Date): Promise<PlaybackSession> {
    throw new NvrUnsupportedError('Playback is not supported for Direct RTSP cameras.');
  }

  async stopPlayback(_sessionId: string): Promise<void> {
    void _sessionId;
  }
}
