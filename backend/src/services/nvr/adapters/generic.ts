import { INvrAdapter, NvrCredentials, NvrConnectionTestResult, DiscoveredChannel, RecordingSegment, PlaybackSession, NvrUnsupportedError } from '../types.js';
import { rtspBase } from '../http.js';

/**
 * Generic adapter for brands without a dedicated implementation.
 * - testConnection: TCP reachability check on the RTSP port.
 * - discoverCameras: NOT supported — user must configure cameras via Direct RTSP.
 * - Live stream: uses the provided RTSP URL directly.
 * - Playback: NOT supported.
 */
export class GenericAdapter implements INvrAdapter {
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
          message: `RTSP port ${creds.rtspPort} is reachable, but this brand has no authentication or video-stream verifier configured.`,
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
    throw new NvrUnsupportedError(
      'Automatic camera discovery is not supported for this NVR brand. Please use Direct RTSP configuration to add cameras manually.'
    );
  }

  getLiveStreamUrl(creds: NvrCredentials, channelNumber: number): string {
    // Generic guess: /cam/realmonitor?channel=N&subtype=0 (Dahua-style, most common)
    return `${rtspBase(creds)}/cam/realmonitor?channel=${channelNumber}&subtype=0`;
  }

  async searchRecordings(_creds: NvrCredentials, _channelNumber: number, _start: Date, _end: Date): Promise<RecordingSegment[]> {
    throw new NvrUnsupportedError('Recording search is not supported for this NVR brand.');
  }

  async startPlayback(_creds: NvrCredentials, _channelNumber: number, _start: Date, _end: Date): Promise<PlaybackSession> {
    throw new NvrUnsupportedError('Playback is not supported for this NVR brand.');
  }

  async stopPlayback(_sessionId: string): Promise<void> {
    // no-op
  }
}
