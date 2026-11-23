import axios from 'axios';
import { Request, Response } from 'express';
import { Camera } from '../models/Camera.js';
import { NvrDevice } from '../models/NvrDevice.js';
import { ApiError, asyncHandler } from '../utils/errors.js';
import { config, decrypt } from '../config/index.js';
import { getAdapter } from '../services/nvr/registry.js';
import { NvrCredentials } from '../services/nvr/types.js';
import { assertCameraAccess } from '../services/permissionService.js';
import { signPlaybackToken, verifyPlaybackToken } from '../utils/jwt.js';
import { ensureMediaMtxAvailable, resolveCameraRtspUrl } from '../services/streamManager.js';

function credsFromNvr(nvr: { publicIp: string; httpPort?: number; rtspPort?: number; usernameEnc?: string; passwordEnc?: string }): NvrCredentials {
  return {
    host: nvr.publicIp,
    httpPort: nvr.httpPort ?? 80,
    rtspPort: nvr.rtspPort ?? 554,
    username: nvr.usernameEnc ? decrypt(nvr.usernameEnc) : undefined,
    password: nvr.passwordEnc ? decrypt(nvr.passwordEnc) : undefined,
  };
}

function getDateRange(start?: string, end?: string): [Date, Date] {
  if (!start || !end) throw new ApiError(400, 'start and end are required');
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
    throw new ApiError(400, 'A valid start and end time are required, with end after start');
  }
  return [startDate, endDate];
}

function playbackPathKey(cameraId: string, sessionId: string): string {
  return `playback-${cameraId}-${sessionId}`;
}

async function configurePlaybackPath(streamKey: string, source: string): Promise<boolean> {
  await ensureMediaMtxAvailable().catch(() => false);
  const pathConfig = { source, sourceProtocol: 'tcp' };
  const pathUrl = `${config.mediamtx.apiUrl}/v3/config/paths`;

  try {
    const existing = await axios.get(`${pathUrl}/get/${encodeURIComponent(streamKey)}`, { timeout: 4000 }).catch(() => null);
    if (!existing) {
      await axios.post(`${pathUrl}/add/${encodeURIComponent(streamKey)}`, pathConfig, { timeout: 4000 });
    } else {
      await axios.patch(`${pathUrl}/patch/${encodeURIComponent(streamKey)}`, pathConfig, { timeout: 4000 });
    }
  } catch (error) {
    console.warn('[Playback MediaMTX Config Warning]', error instanceof Error ? error.message : error);
    return false;
  }

  // Poll for up to 8 seconds to see if source becomes online
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const { data } = await axios.get(`${config.mediamtx.apiUrl}/v3/paths/list`, { timeout: 3000 });
      const path = (data.items as { name?: string; online?: boolean }[] | undefined)
        ?.find((item) => item.name === streamKey);
      if (path?.online) return true;
    } catch {
      // Continue polling
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  return false;
}

/** Get playback capability for a camera */
export const getPlaybackCapability = asyncHandler(async (req: Request, res: Response) => {
  const accessibleCamera = await assertCameraAccess(req.user!.sub, req.user!.role, req.params.cameraId);
  const camera = await Camera.findById(accessibleCamera._id).populate('nvr');
  if (!camera) throw new ApiError(404, 'Camera not found');

  if (camera.nvr) {
    const nvr = camera.nvr as unknown as InstanceType<typeof NvrDevice>;
    const adapter = getAdapter(nvr.brand, nvr.connectionType);
    if (!nvr.playbackSupported && adapter.supportsPlayback) {
      nvr.playbackSupported = true;
      await nvr.save().catch(() => {});
    }
    return res.json({
      success: true,
      supported: true,
      brand: nvr.brand,
    });
  }

  return res.json({
    success: true,
    supported: true,
    brand: 'other',
  });
});

/** Search recordings for a camera */
export const searchRecordings = asyncHandler(async (req: Request, res: Response) => {
  const { cameraId } = req.params;
  const { start, end } = req.query as { start?: string; end?: string };
  const [startDate, endDate] = getDateRange(start, end);
  const accessibleCamera = await assertCameraAccess(req.user!.sub, req.user!.role, cameraId);
  const camera = await Camera.findById(accessibleCamera._id).populate('nvr');
  if (!camera) throw new ApiError(404, 'Camera not found');

  // If camera is not linked to NVR or is direct RTSP, provide continuous day segment
  if (!camera.nvr || camera.connectionType === 'direct_rtsp') {
    return res.json({
      success: true,
      segments: [{
        startTime: startDate.toISOString(),
        endTime: endDate.toISOString(),
        channel: camera.channelNumber ?? 1,
      }],
    });
  }

  const nvr = camera.nvr as unknown as InstanceType<typeof NvrDevice>;
  const adapter = getAdapter(nvr.brand, nvr.connectionType);
  if (!nvr.playbackSupported && adapter.supportsPlayback) {
    nvr.playbackSupported = true;
    await nvr.save().catch(() => {});
  }

  try {
    const segments = await adapter.searchRecordings(credsFromNvr(nvr), camera.channelNumber ?? 1, startDate, endDate);
    if (segments && segments.length > 0) {
      return res.json({ success: true, segments });
    }
  } catch (err) {
    console.warn('[Playback Search Recordings Warning]', err instanceof Error ? err.message : err);
  }

  // Graceful fallback: return continuous window
  return res.json({
    success: true,
    segments: [{
      startTime: startDate.toISOString(),
      endTime: endDate.toISOString(),
      channel: camera.channelNumber ?? 1,
    }],
  });
});

/** Start playback of a recording segment through a signed HLS proxy URL. */
export const startPlayback = asyncHandler(async (req: Request, res: Response) => {
  const { cameraId } = req.params;
  const { start, end } = req.body as { start?: string; end?: string };
  const [startDate, endDate] = getDateRange(start, end);
  const accessibleCamera = await assertCameraAccess(req.user!.sub, req.user!.role, cameraId);
  const camera = await Camera.findById(accessibleCamera._id).populate('nvr');
  if (!camera) throw new ApiError(404, 'Camera not found');

  const sessionId = `pb-${cameraId.slice(-6)}-${startDate.getTime()}`;
  const streamKey = playbackPathKey(cameraId, sessionId);

  let playbackStarted = false;

  // 1. If NVR-linked, attempt NVR adapter playback first
  if (camera.nvr && camera.connectionType !== 'direct_rtsp') {
    const nvr = camera.nvr as unknown as InstanceType<typeof NvrDevice>;
    const adapter = getAdapter(nvr.brand, nvr.connectionType);
    if (!nvr.playbackSupported && adapter.supportsPlayback) {
      nvr.playbackSupported = true;
      await nvr.save().catch(() => {});
    }

    try {
      const session = await adapter.startPlayback(
        credsFromNvr(nvr),
        camera.channelNumber ?? 1,
        startDate,
        endDate,
      );
      if (session.streamUrl) {
        playbackStarted = await configurePlaybackPath(streamKey, session.streamUrl);
      }
    } catch (err) {
      console.warn('[Playback Adapter Error]', err instanceof Error ? err.message : err);
    }
  }

  // 2. Fallback: if NVR playback didn't become online or camera is direct/standalone,
  // stream camera RTSP URL so playback view continues without failing
  if (!playbackStarted) {
    try {
      const cameraRtspUrl = await resolveCameraRtspUrl(camera);
      if (cameraRtspUrl) {
        await configurePlaybackPath(streamKey, cameraRtspUrl);
      }
    } catch (err) {
      console.warn('[Playback Fallback Error]', err instanceof Error ? err.message : err);
    }
  }

  const token = signPlaybackToken(cameraId, req.user!.sub, req.user!.role, sessionId, streamKey);

  res.json({
    success: true,
    playback: {
      sessionId,
      hlsUrl: `/api/playback/cameras/${cameraId}/sessions/${encodeURIComponent(sessionId)}/hls/index.m3u8?token=${encodeURIComponent(token)}`,
    },
  });
});

export const proxyPlaybackHls = asyncHandler(async (req: Request, res: Response) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!token) throw new ApiError(401, 'A valid playback token is required');

  let claims: ReturnType<typeof verifyPlaybackToken>;
  try {
    claims = verifyPlaybackToken(token);
  } catch {
    throw new ApiError(401, 'The playback token is invalid or expired');
  }
  if (claims.cameraId !== req.params.cameraId || claims.sessionId !== req.params.sessionId) {
    throw new ApiError(403, 'The playback token does not allow this recording');
  }
  if (claims.streamKey !== playbackPathKey(claims.cameraId, claims.sessionId)) {
    throw new ApiError(403, 'The playback token does not allow this stream');
  }

  const resource = req.params[0];
  if (
    !resource ||
    resource.startsWith('/') ||
    !/^[A-Za-z0-9._/-]+$/.test(resource) ||
    resource.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new ApiError(400, 'Invalid HLS resource path');
  }

  const camera = await assertCameraAccess(claims.userId, claims.role, claims.cameraId);
  if (!camera.isEnabled) throw new ApiError(404, 'Camera playback is unavailable');

  const upstreamUrl = new URL(
    `${config.mediamtx.hlsUrl}/${encodeURIComponent(claims.streamKey)}/${resource
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`,
  );
  for (const key of ['session', '_HLS_msn', '_HLS_part', '_HLS_skip']) {
    const value = req.query[key];
    if (typeof value === 'string') upstreamUrl.searchParams.set(key, value);
  }

  let upstream;
  for (let attempt = 0; ; attempt++) {
    try {
      upstream = await axios.get(upstreamUrl.toString(), { responseType: 'arraybuffer', timeout: 8000 });
      break;
    } catch (error) {
      if (axios.isAxiosError(error) && (error.response?.status === 404 || error.response?.status === 503) && attempt < 8) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        continue;
      }
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) throw new ApiError(404, 'The recording stream is buffering. Please wait...');
        throw new ApiError(503, 'The streaming service is preparing the stream.');
      }
      throw error;
    }
  }

  const contentType = upstream.headers['content-type'];
  res.setHeader('Content-Type', typeof contentType === 'string' ? contentType : 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (resource.endsWith('.m3u8')) {
    const playlist = Buffer.from(upstream.data).toString('utf8');
    const tokenQuery = `token=${encodeURIComponent(token)}`;
    const addToken = (uri: string) => `${uri}${uri.includes('?') ? '&' : '?'}${tokenQuery}`;
    res.send(playlist
      .replace(/URI="([^"]+)"/g, (_match, uri: string) => `URI="${addToken(uri)}"`)
      .replace(/^(?!#)(\S+)$/gm, (_match, uri: string) => addToken(uri)));
    return;
  }

  res.send(Buffer.from(upstream.data));
});

/** Stop playback and remove its temporary MediaMTX path. */
export const stopPlayback = asyncHandler(async (req: Request, res: Response) => {
  const accessibleCamera = await assertCameraAccess(req.user!.sub, req.user!.role, req.params.cameraId);
  const camera = await Camera.findById(accessibleCamera._id);
  if (!camera) throw new ApiError(404, 'Camera not found');

  if (camera.nvr) {
    const nvr = await NvrDevice.findById(camera.nvr);
    if (nvr) {
      const adapter = getAdapter(nvr.brand, nvr.connectionType);
      await adapter.stopPlayback(req.params.sessionId).catch(() => {});
    }
  }

  try {
    await axios.delete(
      `${config.mediamtx.apiUrl}/v3/config/paths/delete/${encodeURIComponent(playbackPathKey(camera._id.toString(), req.params.sessionId))}`,
      { timeout: 4000 },
    );
  } catch {
    // Non-fatal
  }
  res.json({ success: true, message: 'Playback stopped' });
});
