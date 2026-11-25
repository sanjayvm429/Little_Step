import axios from 'axios';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { config } from '../config/index.js';
import { Camera } from '../models/Camera.js';
import { NvrDevice } from '../models/NvrDevice.js';
import { decrypt } from '../config/index.js';
import { getAdapter } from './nvr/registry.js';
import { resolveRtspUrl } from '../controllers/cameraController.js';

let localMediaMtxProcess: ChildProcess | undefined;

/**
 * Provisions a MediaMTX path for a camera so the browser can consume
 * WebRTC/HLS without ever seeing the raw RTSP URL or credentials.
 *
 * MediaMTX API: POST /v3/config/paths/add/{name} { source }
 * The `source` is the RTSP URL (with credentials) — kept server-side only.
 */
export async function provisionStreamPath(camera: InstanceType<typeof Camera> | { streamKey: string; rtspUrlEnc?: string; nvr?: unknown; channelNumber?: number; connectionType?: string; isSimulated?: boolean }): Promise<void> {
  if (camera.isSimulated) return; // simulated cameras don't need a real source

  const rtspUrl = await resolveCameraRtspUrl(camera as InstanceType<typeof Camera>);
  if (!rtspUrl) throw new Error('No RTSP source is configured for this camera');

  let pathConfig: { source?: string; sourceProtocol?: string } | undefined;
  try {
    const response = await axios.get(
      `${config.mediamtx.apiUrl}/v3/config/paths/get/${encodeURIComponent(camera.streamKey)}`,
      { timeout: 5000 }
    );
    pathConfig = response.data;
  } catch (err) {
    if (!axios.isAxiosError(err) || err.response?.status !== 404) {
      throw new Error(`Could not inspect MediaMTX path ${camera.streamKey}`, { cause: err });
    }
  }

  const desiredConfig = { source: rtspUrl, sourceProtocol: 'tcp' };
  try {
    if (!pathConfig) {
      await axios.post(
        `${config.mediamtx.apiUrl}/v3/config/paths/add/${encodeURIComponent(camera.streamKey)}`,
        desiredConfig,
        { timeout: 5000 }
      );
    } else if (pathConfig.source !== desiredConfig.source || pathConfig.sourceProtocol !== desiredConfig.sourceProtocol) {
      await axios.patch(
        `${config.mediamtx.apiUrl}/v3/config/paths/patch/${encodeURIComponent(camera.streamKey)}`,
        desiredConfig,
        { timeout: 5000 }
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not provision MediaMTX path ${camera.streamKey}: ${message}`, { cause: err });
  }

  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const { data } = await axios.get(`${config.mediamtx.apiUrl}/v3/paths/list`, { timeout: 5000 });
    const path = (data.items as { name?: string; online?: boolean }[] | undefined)
      ?.find((item) => item.name === camera.streamKey);
    if (path?.online) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  throw new Error(`MediaMTX path ${camera.streamKey} did not receive a live source within 10 seconds`);
}

export async function ensureStreamPath(camera: InstanceType<typeof Camera> | { streamKey: string; rtspUrlEnc?: string; nvr?: unknown; channelNumber?: number; connectionType?: string; isSimulated?: boolean }): Promise<void> {
  if (camera.isSimulated) return;

  const { data } = await axios.get(`${config.mediamtx.apiUrl}/v3/paths/list`, { timeout: 5000 });
  const path = (data.items as { name?: string; online?: boolean }[] | undefined)
    ?.find((item) => item.name === camera.streamKey);
  if (path?.online) return;

  await provisionStreamPath(camera);
}

export async function removeStreamPath(streamKey: string): Promise<void> {
  try {
    await axios.delete(`${config.mediamtx.apiUrl}/v3/config/paths/delete/${encodeURIComponent(streamKey)}`, { timeout: 5000 });
  } catch {
    // path may not exist — fine
  }
}

let streamReconcileRunning = false;

export async function ensureMediaMtxAvailable(): Promise<boolean> {
  try {
    await axios.get(`${config.mediamtx.apiUrl}/v3/paths/list`, { timeout: 3000 });
    return true;
  } catch {
    // Docker/production environments should start MediaMTX through their orchestrator.
  }

  if (config.env !== 'development' || process.platform !== 'win32') return false;

  if (!localMediaMtxProcess) {
    const executable = config.mediamtx.executablePath
      ?? path.resolve(process.cwd(), '../streaming/mediamtx-bin/mediamtx.exe');
    const configPath = config.mediamtx.localConfigPath
      ?? path.resolve(process.cwd(), '../streaming/mediamtx.local.yml');
    try {
      localMediaMtxProcess = spawn(executable, [configPath], {
        stdio: 'ignore',
        windowsHide: true,
      });
      localMediaMtxProcess.once('exit', () => {
        localMediaMtxProcess = undefined;
      });
      localMediaMtxProcess.once('error', () => {
        localMediaMtxProcess = undefined;
      });
    } catch (error) {
      console.warn(
        '[Streaming] Could not start local MediaMTX:',
        error instanceof Error ? error.message : error,
      );
      return false;
    }
  }

  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      await axios.get(`${config.mediamtx.apiUrl}/v3/paths/list`, { timeout: 3000 });
      console.log('[Streaming] Local MediaMTX is available');
      return true;
    } catch {
      // Keep waiting for MediaMTX startup.
    }
  }
  return false;
}

export function stopLocalMediaMtx(): void {
  if (localMediaMtxProcess && !localMediaMtxProcess.killed) {
    localMediaMtxProcess.kill();
  }
  localMediaMtxProcess = undefined;
}

export async function reconcileEnabledCameraStreams(): Promise<void> {
  if (streamReconcileRunning) return;
  streamReconcileRunning = true;
  try {
    const mediaMtxAvailable = await ensureMediaMtxAvailable();
    if (!mediaMtxAvailable) {
      console.warn('[Streaming] MediaMTX is unavailable; stream reconciliation is deferred');
      return;
    }
    const { data: pathData } = await axios.get(`${config.mediamtx.apiUrl}/v3/paths/list`, { timeout: 5000 });
    const onlinePaths = new Set<string>();
    for (const item of (pathData.items as { name?: string; online?: boolean }[] | undefined) ?? []) {
      if (item.online && item.name) onlinePaths.add(item.name);
    }
    const cameras = await Camera.find({ isEnabled: true });
    await Promise.all(cameras.map(async (camera) => {
      if (camera.isSimulated || onlinePaths.has(camera.streamKey)) return;
      try {
        await provisionStreamPath(camera);
      } catch (error) {
        console.warn(
          `[Streaming] Could not reconcile ${camera.name} (${camera.streamKey}):`,
          error instanceof Error ? error.message : error,
        );
      }
    }));
  } catch {
    console.warn('[Streaming] MediaMTX is not reachable; stream reconciliation is deferred');
  } finally {
    streamReconcileRunning = false;
  }
}

export function startStreamSelfHealing(intervalMs = 60000): NodeJS.Timeout {
  void reconcileEnabledCameraStreams();
  return setInterval(() => {
    void reconcileEnabledCameraStreams();
  }, intervalMs);
}

/** Resolve the full RTSP URL for a camera, including NVR-derived URLs. */
export async function resolveCameraRtspUrl(camera: InstanceType<typeof Camera>): Promise<string | null> {
  // NVR-linked cameras must use the adapter before any legacy direct RTSP fields.
  if (camera.nvr && camera.channelNumber) {
    const nvr = await NvrDevice.findById(camera.nvr);
    if (!nvr) return null;
    const adapter = getAdapter(nvr.brand, nvr.connectionType);
    const creds = {
      host: nvr.publicIp,
      httpPort: nvr.httpPort ?? 80,
      rtspPort: nvr.rtspPort ?? 554,
      username: nvr.usernameEnc ? decrypt(nvr.usernameEnc) : undefined,
      password: nvr.passwordEnc ? decrypt(nvr.passwordEnc) : undefined,
    };
    if (adapter.prepareLiveStream) {
      await adapter.prepareLiveStream(creds, camera.channelNumber);
    }
    return adapter.getLiveStreamUrl(creds, camera.channelNumber);
  }

  // Direct RTSP or legacy standalone
  const direct = resolveRtspUrl(camera);
  if (direct) return direct;

  return null;
}
