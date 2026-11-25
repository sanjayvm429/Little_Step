import { Request, Response } from 'express';
import axios from 'axios';
import { Camera } from '../models/Camera.js';
import { NvrDevice } from '../models/NvrDevice.js';
import { CameraAccessPermission } from '../models/CameraAccessPermission.js';
import { ApiError, asyncHandler } from '../utils/errors.js';
import { encrypt, decrypt, config } from '../config/index.js';
import { signStreamToken, verifyStreamToken } from '../utils/jwt.js';
import { assertCameraAccess } from '../services/permissionService.js';
import { AuditLog } from '../models/AuditLog.js';
import { ensureStreamPath, provisionStreamPath, removeStreamPath } from '../services/streamManager.js';

function sanitize(camera: object) {
  const { usernameEnc, passwordEnc, rtspUrlEnc, ipAddress, rtspPort, rtspPath, ...rest } = camera as Record<string, unknown>;
  return rest;
}

function relationId(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return undefined;
  if ('_id' in value) return String((value as { _id: unknown })._id);
  return String(value);
}

export const listCameras = asyncHandler(async (req: Request, res: Response) => {
  const { role, sub } = req.user!;
  const { nvr, brand, location, status, connectionType, search, includeDisabled } = req.query as Record<string, string>;
  let cameras;

  if (role === 'admin') {
    cameras = await Camera.find().populate('classroom', 'name').populate('nvr', 'name brand location');
  } else if (role === 'teacher') {
    const { Classroom } = await import('../models/Classroom.js');
    const classrooms = await Classroom.find({ teacher: sub }).select('_id');
    const classIds = classrooms.map((c) => c._id);
    const perms = await CameraAccessPermission.find({ user: sub, status: 'active' }).select('camera');
    const permIds = perms.map((p) => p.camera);
    cameras = await Camera.find({
      isEnabled: true,
      $or: [{ classroom: { $in: classIds } }, { _id: { $in: permIds } }],
    }).populate('classroom', 'name').populate('nvr', 'name brand location');
  } else {
    const { getApprovedChildIds } = await import('../services/permissionService.js');
    const { Child } = await import('../models/Child.js');
    const childIds = await getApprovedChildIds(sub);
    const children = await Child.find({ _id: { $in: childIds } }).select('classroom');
    const classIds = [...new Set(children.map((c) => c.classroom?.toString()).filter(Boolean))];
    const perms = await CameraAccessPermission.find({ user: sub, status: 'active' }).select('camera');
    const permIds = perms.map((p) => p.camera);
    cameras = await Camera.find({
      isEnabled: true,
      $or: [{ classroom: { $in: classIds } }, { _id: { $in: permIds } }],
    }).populate('classroom', 'name').populate('nvr', 'name brand location');
  }

  if (role === 'admin') {
    let filtered = cameras;
    if (nvr) filtered = filtered.filter((c) => relationId(c.nvr) === nvr);
    if (brand) {
      const nvrIds = (await NvrDevice.find({ brand }).select('_id')).map((n) => n._id.toString());
      filtered = filtered.filter((c) => {
        const linkedNvrId = relationId(c.nvr);
        return linkedNvrId !== undefined && nvrIds.includes(linkedNvrId);
      });
    }
    if (location) filtered = filtered.filter((c) => c.location.toLowerCase().includes(location.toLowerCase()));
    if (status) filtered = filtered.filter((c) => c.status === status);
    if (connectionType) filtered = filtered.filter((c) => c.connectionType === connectionType);
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter((c) => c.name.toLowerCase().includes(q) || c.cameraId.toLowerCase().includes(q));
    }
    if (includeDisabled !== 'true') filtered = filtered.filter((c) => c.isEnabled);
    cameras = filtered;
  }

  res.json({ success: true, cameras: cameras.map((c) => sanitize(c.toObject())) });
});

export const getCamera = asyncHandler(async (req: Request, res: Response) => {
  const camera = await assertCameraAccess(req.user!.sub, req.user!.role, req.params.id);
  const populated = await Camera.findById(camera._id).populate('nvr', 'name brand location').populate('classroom', 'name');
  res.json({ success: true, camera: sanitize((populated ?? camera).toObject()) });
});

export const createCamera = asyncHandler(async (req: Request, res: Response) => {
  if (req.user!.role !== 'admin') throw new ApiError(403, 'Admin only');
  const { username, password, rtspUrl, ...rest } = req.body;
  const streamKey = rest.streamKey || `cam-${Date.now()}`;
  const camera = await Camera.create({
    ...rest,
    streamKey,
    connectionType: rest.connectionType ?? 'standalone',
    isEnabled: rest.isEnabled ?? true,
    usernameEnc: username ? encrypt(username) : undefined,
    passwordEnc: password ? encrypt(password) : undefined,
    rtspUrlEnc: rtspUrl ? encrypt(rtspUrl) : undefined,
  });
  if (camera.isEnabled) await provisionStreamPath(camera).catch(() => { /* non-fatal */ });
  res.status(201).json({ success: true, camera: sanitize(camera.toObject()) });
});

export const updateCamera = asyncHandler(async (req: Request, res: Response) => {
  if (req.user!.role !== 'admin') throw new ApiError(403, 'Admin only');
  const { username, password, rtspUrl, ...rest } = req.body;
  const update: Record<string, unknown> = { ...rest };
  if (username) update.usernameEnc = encrypt(username);
  if (password) update.passwordEnc = encrypt(password);
  if (rtspUrl) update.rtspUrlEnc = encrypt(rtspUrl);
  const camera = await Camera.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!camera) throw new ApiError(404, 'Camera not found');
  if (camera.isEnabled) await provisionStreamPath(camera).catch(() => { /* non-fatal */ });
  else await removeStreamPath(camera.streamKey).catch(() => { /* non-fatal */ });
  res.json({ success: true, camera: sanitize(camera.toObject()) });
});

export const deleteCamera = asyncHandler(async (req: Request, res: Response) => {
  if (req.user!.role !== 'admin') throw new ApiError(403, 'Admin only');
  const camera = await Camera.findById(req.params.id);
  if (!camera) throw new ApiError(404, 'Camera not found');
  await removeStreamPath(camera.streamKey).catch(() => { /* non-fatal */ });
  await camera.deleteOne();
  await CameraAccessPermission.deleteMany({ camera: req.params.id });
  res.json({ success: true, message: 'Camera deleted' });
});

export const toggleCamera = asyncHandler(async (req: Request, res: Response) => {
  if (req.user!.role !== 'admin') throw new ApiError(403, 'Admin only');
  const camera = await Camera.findById(req.params.id);
  if (!camera) throw new ApiError(404, 'Camera not found');
  camera.isEnabled = !camera.isEnabled;
  await camera.save();
  if (camera.isEnabled) await provisionStreamPath(camera).catch(() => { /* non-fatal */ });
  else await removeStreamPath(camera.streamKey).catch(() => { /* non-fatal */ });
  res.json({ success: true, camera: sanitize(camera.toObject()) });
});

/**
 * Issues a short-lived signed stream token after verifying camera access.
 * Raw RTSP URLs and credentials are NEVER exposed to the browser.
 */
export const getStreamAccess = asyncHandler(async (req: Request, res: Response) => {
  const camera = await assertCameraAccess(req.user!.sub, req.user!.role, req.params.id);
  if (!camera.isEnabled) throw new ApiError(403, 'This camera is disabled');

  try {
    await ensureStreamPath(camera);
  } catch (err) {
    console.error('[Camera Stream Provisioning Error]', err instanceof Error ? err.message : err);
    throw new ApiError(503, 'The streaming service could not prepare this camera. Please retry shortly.');
  }

  const token = signStreamToken(camera._id.toString(), req.user!.sub);

  await AuditLog.create({
    actor: req.user!.sub,
    actorRole: req.user!.role,
    action: 'camera.stream_access',
    resource: 'Camera',
    resourceId: camera._id.toString(),
    ip: req.ip,
  });

  res.json({
    success: true,
    stream: {
      token,
      streamKey: camera.streamKey,
      webrtcUrl: config.mediamtx.webrtcUrl,
      hlsUrl: `/api/cameras/${camera._id}/hls/index.m3u8?token=${encodeURIComponent(token)}`,
      expiresIn: config.streamTokenExpiresIn,
      expiresAt: verifyStreamToken(token).expiresAt,
      isSimulated: camera.isSimulated,
    },
  });
});

export const proxyStreamHls = asyncHandler(async (req: Request, res: Response) => {
  const token = typeof req.query.token === 'string'
    ? req.query.token
    : req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : '';
  if (!token) throw new ApiError(401, 'A valid stream token is required');

  let claims: ReturnType<typeof verifyStreamToken>;
  try {
    claims = verifyStreamToken(token);
  } catch {
    throw new ApiError(401, 'The stream token is invalid or expired');
  }
  if (claims.cameraId !== req.params.id) throw new ApiError(403, 'The stream token does not allow this camera');

  const resource = req.params[0];
  if (
    !resource ||
    resource.startsWith('/') ||
    !/^[A-Za-z0-9._/-]+$/.test(resource) ||
    resource.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new ApiError(400, 'Invalid HLS resource path');
  }

  const camera = await Camera.findById(claims.cameraId).select('streamKey isEnabled');
  if (!camera || !camera.isEnabled) throw new ApiError(404, 'Camera stream is unavailable');

  const upstreamUrl = new URL(
    `${config.mediamtx.hlsUrl}/${encodeURIComponent(camera.streamKey)}/${resource
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`
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
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404 && resource === 'index.m3u8' && attempt < 10) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        continue;
      }
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 404) throw new ApiError(404, 'The camera has not produced this HLS segment yet');
        throw new ApiError(503, 'The streaming service is unavailable');
      }
      throw err;
    }
  }

  const upstreamContentType = upstream.headers['content-type'];
  const contentType = typeof upstreamContentType === 'string' ? upstreamContentType : 'application/octet-stream';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (resource.endsWith('.m3u8')) {
    const playlist = Buffer.from(upstream.data).toString('utf8');
    const tokenQuery = `token=${encodeURIComponent(token)}`;
    const addToken = (uri: string) => `${uri}${uri.includes('?') ? '&' : '?'}${tokenQuery}`;
    const securedPlaylist = playlist
      .replace(/URI="([^"]+)"/g, (_match, uri: string) => `URI="${addToken(uri)}"`)
      .replace(/^(?!#)(\S+)$/gm, (_match, uri: string) => addToken(uri));
    res.send(securedPlaylist);
    return;
  }

  res.send(Buffer.from(upstream.data));
});

/** Admin-only: test camera connectivity */
export const testCamera = asyncHandler(async (req: Request, res: Response) => {
  if (req.user!.role !== 'admin') throw new ApiError(403, 'Admin only');
  const camera = await Camera.findById(req.params.id);
  if (!camera) throw new ApiError(404, 'Camera not found');

  if (camera.isSimulated) {
    camera.status = 'online';
    camera.lastHealthCheck = new Date();
    await camera.save();
    return res.json({ success: true, status: 'online', message: 'Simulated camera is healthy' });
  }

  try {
    const rtspUrl = resolveRtspUrl(camera);
    if (rtspUrl) {
      const u = new URL(rtspUrl);
      const port = parseInt(u.port || '554', 10);
      const host = u.hostname;
      const net = await import('net');
      const ok = await new Promise<boolean>((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(5000);
        socket.once('connect', () => { socket.destroy(); resolve(true); });
        socket.once('timeout', () => { socket.destroy(); resolve(false); });
        socket.once('error', () => { socket.destroy(); resolve(false); });
        socket.connect(port, host);
      });
      camera.status = ok ? 'online' : 'offline';
      camera.lastHealthCheck = new Date();
      await camera.save();
      return res.json({ success: ok, status: camera.status, message: ok ? 'RTSP endpoint reachable' : 'RTSP endpoint unreachable' });
    }
  } catch {
    // fall through
  }

  camera.status = 'unknown';
  camera.lastHealthCheck = new Date();
  await camera.save();
  res.json({ success: true, status: 'unknown', message: 'Could not determine stream status' });
});

/** Resolve the server-side RTSP URL for a camera (never sent to frontend). */
export function resolveRtspUrl(camera: {
  rtspUrlEnc?: string; ipAddress?: string; rtspPort?: number; rtspPath?: string;
  usernameEnc?: string; passwordEnc?: string;
}): string | null {
  if (camera.rtspUrlEnc) return decrypt(camera.rtspUrlEnc);
  if (camera.ipAddress && camera.rtspPath) {
    const auth = camera.usernameEnc ? `${encodeURIComponent(decrypt(camera.usernameEnc))}:${encodeURIComponent(camera.passwordEnc ? decrypt(camera.passwordEnc) : '')}@` : '';
    return `rtsp://${auth}${camera.ipAddress}:${camera.rtspPort ?? 554}${camera.rtspPath}`;
  }
  return null;
}

export const grantCameraAccess = asyncHandler(async (req: Request, res: Response) => {
  if (req.user!.role !== 'admin') throw new ApiError(403, 'Admin only');
  const { cameraId, userId } = req.body;
  const perm = await CameraAccessPermission.findOneAndUpdate(
    { camera: cameraId, user: userId },
    { grantedBy: req.user!.sub, status: 'active' },
    { upsert: true, new: true }
  );
  res.json({ success: true, permission: perm });
});

export const revokeCameraAccess = asyncHandler(async (req: Request, res: Response) => {
  if (req.user!.role !== 'admin') throw new ApiError(403, 'Admin only');
  const perm = await CameraAccessPermission.findOneAndUpdate(
    { camera: req.params.cameraId, user: req.params.userId },
    { status: 'revoked' },
    { new: true }
  );
  if (!perm) throw new ApiError(404, 'Permission not found');
  res.json({ success: true, permission: perm });
});

export { decrypt };
