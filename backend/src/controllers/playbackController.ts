import axios from 'axios';
import { Request, Response } from 'express';
import { Camera } from '../models/Camera.js';
import { NvrDevice } from '../models/NvrDevice.js';
import { ApiError, asyncHandler } from '../utils/errors.js';
import { config, decrypt } from '../config/index.js';
import { getAdapter } from '../services/nvr/registry.js';
import { NvrCredentials, NvrUnsupportedError } from '../services/nvr/types.js';
import { assertCameraAccess } from '../services/permissionService.js';
import { signPlaybackToken, verifyPlaybackToken } from '../utils/jwt.js';

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

async function configurePlaybackPath(streamKey: string, source: string): Promise<void> {
  const pathConfig = { source, sourceProtocol: 'tcp' };
  const pathUrl = `${config.mediamtx.apiUrl}/v3/config/paths`;
  try {
    await axios.get(`${pathUrl}/get/${encodeURIComponent(streamKey)}`, { timeout: 5000 });
    await axios.patch(`${pathUrl}/patch/${encodeURIComponent(streamKey)}`, pathConfig, { timeout: 5000 });
  } catch (error) {
    if (!axios.isAxiosError(error) || error.response?.status !== 404) {
      throw new ApiError(502, 'The streaming service could not configure recording playback');
    }
    try {
      await axios.post(`${pathUrl}/add/${encodeURIComponent(streamKey)}`, pathConfig, { timeout: 5000 });
    } catch {
      throw new ApiError(502, 'The streaming service could not configure recording playback');
    }
  }
}

/** Get playback capability for a camera's NVR */
export const getPlaybackCapability = asyncHandler(async (req: Request, res: Response) => {
  const accessibleCamera = await assertCameraAccess(req.user!.sub, req.user!.role, req.params.cameraId);
  const camera = await Camera.findById(accessibleCamera._id).populate('nvr');
  if (!camera?.nvr) {
    return res.json({ success: true, supported: false, reason: 'Camera is not linked to an NVR' });
  }
  const nvr = camera.nvr as unknown as InstanceType<typeof NvrDevice>;
  const adapter = getAdapter(nvr.brand, nvr.connectionType);
  const supported = adapter.supportsPlayback && nvr.playbackSupported;
  res.json({
    success: true,
    supported,
    brand: nvr.brand,
    reason: !adapter.supportsPlayback
      ? 'This NVR brand does not support recording retrieval through the available integration'
      : !nvr.playbackSupported
        ? 'Recording playback is not enabled for this NVR'
        : undefined,
  });
});

/** Search recordings for a camera */
export const searchRecordings = asyncHandler(async (req: Request, res: Response) => {
  const { cameraId } = req.params;
  const { start, end } = req.query as { start?: string; end?: string };
  const [startDate, endDate] = getDateRange(start, end);
  const accessibleCamera = await assertCameraAccess(req.user!.sub, req.user!.role, cameraId);
  const camera = await Camera.findById(accessibleCamera._id).populate('nvr');
  if (!camera?.nvr) throw new ApiError(400, 'Camera is not linked to an NVR');
  if (camera.connectionType === 'direct_rtsp') {
    throw new ApiError(400, 'Playback is not supported for Direct RTSP cameras — a live RTSP URL cannot retrieve recordings');
  }

  const nvr = camera.nvr as unknown as InstanceType<typeof NvrDevice>;
  const adapter = getAdapter(nvr.brand, nvr.connectionType);
  if (!adapter.supportsPlayback || !nvr.playbackSupported) {
    throw new ApiError(400, 'Playback is not supported for this NVR');
  }

  try {
    const segments = await adapter.searchRecordings(credsFromNvr(nvr), camera.channelNumber ?? 1, startDate, endDate);
    res.json({ success: true, segments });
  } catch (err) {
    if (err instanceof NvrUnsupportedError) throw new ApiError(400, err.message);
    throw new ApiError(502, err instanceof Error ? err.message : 'Recording search failed');
  }
});

/** Start playback of a recording segment through a signed HLS proxy URL. */
export const startPlayback = asyncHandler(async (req: Request, res: Response) => {
  const { cameraId } = req.params;
  const { start, end } = req.body as { start?: string; end?: string };
  const [startDate, endDate] = getDateRange(start, end);
  const accessibleCamera = await assertCameraAccess(req.user!.sub, req.user!.role, cameraId);
  const camera = await Camera.findById(accessibleCamera._id).populate('nvr');
  if (!camera?.nvr) throw new ApiError(400, 'Camera is not linked to an NVR');
  if (camera.connectionType === 'direct_rtsp') {
    throw new ApiError(400, 'Playback is not supported for Direct RTSP cameras');
  }

  const nvr = camera.nvr as unknown as InstanceType<typeof NvrDevice>;
  const adapter = getAdapter(nvr.brand, nvr.connectionType);
  if (!adapter.supportsPlayback || !nvr.playbackSupported) {
    throw new ApiError(400, 'Playback is not supported for this NVR');
  }

  try {
    const session = await adapter.startPlayback(
      credsFromNvr(nvr),
      camera.channelNumber ?? 1,
      startDate,
      endDate,
    );
    if (session.unsupported) throw new ApiError(400, session.reason ?? 'Playback unsupported');

    const streamKey = playbackPathKey(cameraId, session.sessionId);
    if (session.streamUrl) await configurePlaybackPath(streamKey, session.streamUrl);
    const token = signPlaybackToken(cameraId, req.user!.sub, req.user!.role, session.sessionId, streamKey);

    res.json({
      success: true,
      playback: {
        sessionId: session.sessionId,
        hlsUrl: session.streamUrl
          ? `/api/playback/cameras/${cameraId}/sessions/${encodeURIComponent(session.sessionId)}/hls/index.m3u8?token=${encodeURIComponent(token)}`
          : undefined,
      },
    });
  } catch (err) {
    if (err instanceof NvrUnsupportedError) throw new ApiError(400, err.message);
    if (err instanceof ApiError) throw err;
    throw new ApiError(502, err instanceof Error ? err.message : 'Playback failed to start');
  }
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
      upstream = await axios.get(upstreamUrl.toString(), { responseType: 'arraybuffer', timeout: 10000 });
      break;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404 && resource === 'index.m3u8' && attempt < 10) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        continue;
      }
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) throw new ApiError(404, 'The recording stream is not ready yet');
        throw new ApiError(503, 'The streaming service is unavailable');
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
  if (!camera?.nvr) throw new ApiError(404, 'Camera or NVR not found');
  const nvr = await NvrDevice.findById(camera.nvr);
  if (!nvr) throw new ApiError(404, 'NVR not found');

  const adapter = getAdapter(nvr.brand, nvr.connectionType);
  await adapter.stopPlayback(req.params.sessionId);
  try {
    await axios.delete(
      `${config.mediamtx.apiUrl}/v3/config/paths/delete/${encodeURIComponent(playbackPathKey(camera._id.toString(), req.params.sessionId))}`,
      { timeout: 5000 },
    );
  } catch (error) {
    if (!axios.isAxiosError(error) || error.response?.status !== 404) {
      throw new ApiError(502, 'The streaming service could not stop recording playback');
    }
  }
  res.json({ success: true, message: 'Playback stopped' });
});
