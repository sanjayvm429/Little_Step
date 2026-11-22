import { NvrBrand, NvrConnectionType, NvrStatus } from '../../models/NvrDevice.js';

export interface NvrCredentials {
  host: string;
  httpPort: number;
  rtspPort: number;
  username?: string;
  password?: string;
}

export interface DiscoveredChannel {
  channelNumber: number;
  name: string;
  status: 'online' | 'offline' | 'unknown';
  /** RTSP URL template or full URL for this channel (server-side only) */
  rtspUrl?: string;
  /** Allow manual override if discovery fails */
  manualRtspUrl?: string;
}

export interface RecordingSegment {
  startTime: string; // ISO
  endTime: string;   // ISO
  channel: number;
}

export interface PlaybackSession {
  sessionId: string;
  streamUrl?: string; // browser-compatible URL if available
  unsupported?: boolean;
  reason?: string;
}

export interface NvrConnectionTestResult {
  ok: boolean;
  message: string;
  status?: Exclude<NvrStatus, 'unknown'>;
  deviceInfo?: Record<string, unknown>;
}

/**
 * Common interface every NVR manufacturer adapter must implement.
 * Adding a new brand = implement this interface + register it. No other changes needed.
 */
export interface INvrAdapter {
  readonly brand: NvrBrand;
  /** Whether this adapter can enumerate camera channels over the network. */
  readonly supportsDiscovery: boolean;
  /** Whether this adapter can retrieve recorded footage. */
  readonly supportsPlayback: boolean;

  testConnection(creds: NvrCredentials): Promise<NvrConnectionTestResult>;
  discoverCameras(creds: NvrCredentials): Promise<DiscoveredChannel[]>;
  /** Build the RTSP URL for a channel (used server-side for MediaMTX ingest). */
  getLiveStreamUrl(creds: NvrCredentials, channelNumber: number): string;
  /** Prepare a browser-compatible live stream for a channel, when supported. */
  prepareLiveStream?(creds: NvrCredentials, channelNumber: number): Promise<void>;
  /** Search recordings for a channel within a time range. */
  searchRecordings(creds: NvrCredentials, channelNumber: number, start: Date, end: Date): Promise<RecordingSegment[]>;
  /** Start playback of a recording segment; returns a browser-playable URL or unsupported. */
  startPlayback(creds: NvrCredentials, channelNumber: number, start: Date, end: Date): Promise<PlaybackSession>;
  stopPlayback(sessionId: string): Promise<void>;
}

export class NvrUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NvrUnsupportedError';
  }
}

export function isNvrUnsupported(err: unknown): err is NvrUnsupportedError {
  return err instanceof NvrUnsupportedError;
}

export type { NvrConnectionType };
