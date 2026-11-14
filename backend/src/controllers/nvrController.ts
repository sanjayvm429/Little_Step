import { Request, Response } from 'express';
import { NvrDevice, NvrBrand } from '../models/NvrDevice.js';
import { Camera } from '../models/Camera.js';
import { ApiError, asyncHandler } from '../utils/errors.js';
import { encrypt, decrypt } from '../config/index.js';
import { getAdapter, getAdapterCapabilities } from '../services/nvr/registry.js';
import { NvrCredentials, NvrUnsupportedError } from '../services/nvr/types.js';
import { AuditLog } from '../models/AuditLog.js';
import { isIP } from 'node:net';
import { removeStreamPath } from '../services/streamManager.js';

const BRANDS: NvrBrand[] = ['hikvision', 'dahua', 'cpplus', 'uniview', 'axis', 'hanwha', 'bosch', 'tvt', 'honeywell', 'other'];

function sanitize(nvr: object) {
  const { usernameEnc, passwordEnc, ...rest } = nvr as Record<string, unknown>;
  return rest;
}

function credsFromBody(body: {
  publicIp: string; httpPort?: number; rtspPort?: number; username?: string; password?: string;
}): NvrCredentials {
  return {
    host: body.publicIp,
    httpPort: body.httpPort ?? 80,
    rtspPort: body.rtspPort ?? 554,
    username: body.username,
    password: body.password,
  };
}

function credsFromDevice(nvr: { publicIp: string; httpPort?: number; rtspPort?: number; usernameEnc?: string; passwordEnc?: string }): NvrCredentials {
  return {
    host: nvr.publicIp,
    httpPort: nvr.httpPort ?? 80,
    rtspPort: nvr.rtspPort ?? 554,
    username: nvr.usernameEnc ? decrypt(nvr.usernameEnc) : undefined,
    password: nvr.passwordEnc ? decrypt(nvr.passwordEnc) : undefined,
  };
}

// ---- NVR CRUD ----

export const listNvrs = asyncHandler(async (_req: Request, res: Response) => {
  const nvrs = await NvrDevice.find().populate('createdBy', 'fullName').lean();
  const result = await Promise.all(nvrs.map(async (n) => {
    const cameraCount = await Camera.countDocuments({ nvr: n._id });
    const caps = getAdapterCapabilities(n.brand, n.connectionType);
    return { ...sanitize(n), cameraCount, capabilities: caps };
  }));
  res.json({ success: true, nvrs: result });
});

export const getNvr = asyncHandler(async (req: Request, res: Response) => {
  const nvr = await NvrDevice.findById(req.params.id);
  if (!nvr) throw new ApiError(404, 'NVR not found');
  const cameraCount = await Camera.countDocuments({ nvr: nvr._id });
  res.json({ success: true, nvr: { ...sanitize(nvr.toObject()), cameraCount, capabilities: getAdapterCapabilities(nvr.brand, nvr.connectionType) } });
});

export const createNvr = asyncHandler(async (req: Request, res: Response) => {
  if (req.user!.role !== 'admin') throw new ApiError(403, 'Admin only');
  const { brand, name, modelNumber, location, publicIp, username, password, httpPort, rtspPort, connectionType, skipDiscovery } = req.body;

  if (!BRANDS.includes(brand)) throw new ApiError(400, 'Unsupported NVR brand');
  if (!name || !location || !publicIp) throw new ApiError(400, 'Name, location and public IP are required');
  if (typeof publicIp !== 'string' || isIP(publicIp) !== 4) {
    throw new ApiError(400, 'A valid IPv4 address is required');
  }
  if (!['http_rtsp', 'direct_rtsp'].includes(connectionType)) throw new ApiError(400, 'Invalid connection type');
  for (const [label, port] of [['HTTP', httpPort], ['RTSP', rtspPort]] as const) {
    if (connectionType === 'http_rtsp' && (!Number.isInteger(port) || port < 1 || port > 65535)) {
      throw new ApiError(400, `A valid ${label} port is required`);
    }
  }
  if (connectionType === 'http_rtsp' && (!username || !password)) {
    throw new ApiError(400, 'NVR username and password are required');
  }

  // Duplicate check
  const dup = await NvrDevice.findOne({ publicIp, httpPort: httpPort ?? 80, connectionType });
  if (dup) throw new ApiError(409, 'An NVR with this IP and port is already configured');

  const nvr = await NvrDevice.create({
    brand,
    name,
    modelNumber,
    location,
    publicIp,
    httpPort,
    rtspPort,
    connectionType,
    usernameEnc: username ? encrypt(username) : undefined,
    passwordEnc: password ? encrypt(password) : undefined,
    playbackSupported: getAdapterCapabilities(brand, connectionType).supportsPlayback,
    createdBy: req.user!.sub,
  });

  await AuditLog.create({
    actor: req.user!.sub, actorRole: req.user!.role, action: 'nvr.create',
    resource: 'NvrDevice', resourceId: nvr._id.toString(), ip: req.ip,
  });

  res.status(201).json({ success: true, nvr: sanitize(nvr.toObject()), message: skipDiscovery ? 'NVR saved. Add cameras manually via Camera Management or Direct RTSP mode.' : 'NVR saved successfully' });
});

export const updateNvr = asyncHandler(async (req: Request, res: Response) => {
  if (req.user!.role !== 'admin') throw new ApiError(403, 'Admin only');
  const { username, password, ...rest } = req.body;
  const update: Record<string, unknown> = { ...rest };
  if (username) update.usernameEnc = encrypt(username);
  if (password) update.passwordEnc = encrypt(password);
  if (rest.brand || rest.connectionType) {
    update.playbackSupported = getAdapterCapabilities(rest.brand ?? 'other', rest.connectionType ?? 'http_rtsp').supportsPlayback;
  }
  const nvr = await NvrDevice.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!nvr) throw new ApiError(404, 'NVR not found');
  res.json({ success: true, nvr: sanitize(nvr.toObject()) });
});

export const deleteNvr = asyncHandler(async (req: Request, res: Response) => {
  if (req.user!.role !== 'admin') throw new ApiError(403, 'Admin only');
  const nvr = await NvrDevice.findById(req.params.id);
  if (!nvr) throw new ApiError(404, 'NVR not found');
  const camCount = await Camera.countDocuments({ nvr: nvr._id });
  if (camCount > 0) throw new ApiError(409, `Cannot delete: ${camCount} camera(s) are linked to this NVR. Delete them first.`);
  await nvr.deleteOne();
  res.json({ success: true, message: 'NVR deleted' });
});

// ---- Test connection (works for saved NVR or unsaved form data) ----

export const testNvrConnection = asyncHandler(async (req: Request, res: Response) => {
  if (req.user!.role !== 'admin') throw new ApiError(403, 'Admin only');
  const { id } = req.params;
  const body = req.body ?? {};

  let brand: NvrBrand;
  let connectionType: 'http_rtsp' | 'direct_rtsp';
  let creds: NvrCredentials;

  if (id && id !== 'test') {
    const nvr = await NvrDevice.findById(id);
    if (!nvr) throw new ApiError(404, 'NVR not found');
    brand = nvr.brand;
    connectionType = nvr.connectionType;
    creds = credsFromDevice(nvr);
  } else {
    // Unsaved form test
    brand = body.brand;
    connectionType = body.connectionType ?? 'http_rtsp';
    if (!BRANDS.includes(brand)) throw new ApiError(400, 'Unsupported NVR brand');
    if (typeof body.publicIp !== 'string' || isIP(body.publicIp) !== 4) {
      throw new ApiError(400, 'A valid IPv4 address is required');
    }
    for (const [label, port] of [['HTTP', body.httpPort ?? 80], ['RTSP', body.rtspPort ?? 554]] as const) {
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new ApiError(400, `A valid ${label} port is required`);
      }
    }
    if (connectionType === 'http_rtsp' && (!body.username || !body.password)) {
      throw new ApiError(400, 'NVR username and password are required');
    }
    creds = credsFromBody(body);
  }

  const adapter = getAdapter(brand, connectionType);
  try {
    const result = await adapter.testConnection(creds);
    if (id && id !== 'test') {
      const nvr = await NvrDevice.findById(id);
      if (nvr) {
        nvr.status = result.status ?? (result.ok ? 'online' : 'offline');
        nvr.lastHealthCheck = new Date();
        await nvr.save();
      }
    }
    res.json({ success: result.ok, ...result });
  } catch (err) {
    console.error('[NVR Test Connection Error]', err instanceof Error ? err.message : err);
    if (id && id !== 'test') {
      const nvr = await NvrDevice.findById(id);
      if (nvr) {
        nvr.status = 'connection_error';
        nvr.lastHealthCheck = new Date();
        await nvr.save();
      }
    }
    throw new ApiError(502, 'NVR connection test failed. Check the configured address and backend logs.');
  }
});

// ---- Discover cameras ----

export const discoverNvrCameras = asyncHandler(async (req: Request, res: Response) => {
  if (req.user!.role !== 'admin') throw new ApiError(403, 'Admin only');
  const { id } = req.params;
  const body = req.body ?? {};

  let brand: NvrBrand;
  let connectionType: 'http_rtsp' | 'direct_rtsp';
  let creds: NvrCredentials;

  if (id && id !== 'discover') {
    const nvr = await NvrDevice.findById(id);
    if (!nvr) throw new ApiError(404, 'NVR not found');
    brand = nvr.brand;
    connectionType = nvr.connectionType;
    creds = credsFromDevice(nvr);
  } else {
    brand = body.brand;
    connectionType = body.connectionType ?? 'http_rtsp';
    if (!BRANDS.includes(brand)) throw new ApiError(400, 'Unsupported NVR brand');
    creds = credsFromBody(body);
  }

  const adapter = getAdapter(brand, connectionType);
  if (!adapter.supportsDiscovery) {
    throw new ApiError(400, 'Camera discovery is not supported for this NVR brand/connection type. Use Direct RTSP configuration instead.');
  }

  try {
    const channels = await adapter.discoverCameras(creds);
    res.json({ success: true, channels });
  } catch (err) {
    if (err instanceof NvrUnsupportedError) throw new ApiError(400, err.message);
    const message = err instanceof Error ? err.message : 'Camera discovery failed';
    console.error('[NVR Discovery Error]', err);
    throw new ApiError(502, message);
  }
});

// ---- Add selected discovered cameras to an NVR ----

export const addNvrCameras = asyncHandler(async (req: Request, res: Response) => {
  if (req.user!.role !== 'admin') throw new ApiError(403, 'Admin only');
  const nvr = await NvrDevice.findById(req.params.id);
  if (!nvr) throw new ApiError(404, 'NVR not found');

  const { cameras } = req.body as { cameras: { channelNumber: number; name: string; rtspUrl?: string; manualRtspUrl?: string }[] };
  if (!Array.isArray(cameras) || cameras.length === 0) throw new ApiError(400, 'No cameras selected');

  const adapter = getAdapter(nvr.brand, nvr.connectionType);
  const creds = credsFromDevice(nvr);
  const created = [];

  for (const cam of cameras) {
    const existing = await Camera.findOne({ nvr: nvr._id, channelNumber: cam.channelNumber });
    if (existing) continue; // skip duplicates

    const rtspUrl = cam.manualRtspUrl || cam.rtspUrl || adapter.getLiveStreamUrl(creds, cam.channelNumber);
    const streamKey = `nvr-${nvr._id.toString().slice(-6)}-ch${cam.channelNumber}`;
    const camera = await Camera.create({
      name: cam.name || `Camera ${cam.channelNumber}`,
      cameraId: `nvr-${nvr._id}-${cam.channelNumber}`,
      location: nvr.location,
      nvr: nvr._id,
      channelNumber: cam.channelNumber,
      connectionType: nvr.connectionType,
      isEnabled: true,
      rtspUrlEnc: encrypt(rtspUrl),
      streamKey,
      status: 'unknown',
    });
    created.push(camera);
  }

  res.status(201).json({ success: true, added: created.length, cameras: created.map((c) => sanitizeCamera(c.toObject())) });
});

export const updateNvrCameraSelection = asyncHandler(async (req: Request, res: Response) => {
  if (req.user!.role !== 'admin') throw new ApiError(403, 'Admin only');
  const nvr = await NvrDevice.findById(req.params.id);
  if (!nvr) throw new ApiError(404, 'NVR not found');

  const { channels } = req.body as { channels?: { channelNumber: number; name?: string }[] };
  if (!Array.isArray(channels) || channels.length > 256) {
    throw new ApiError(400, 'Channels must be an array containing no more than 256 entries');
  }
  const selected = new Map<number, string>();
  for (const channel of channels) {
    if (!Number.isInteger(channel.channelNumber) || channel.channelNumber < 1) {
      throw new ApiError(400, 'Every selected camera must have a valid channel number');
    }
    if (selected.has(channel.channelNumber)) {
      throw new ApiError(400, `Channel ${channel.channelNumber} was selected more than once`);
    }
    const name = typeof channel.name === 'string' ? channel.name.trim() : '';
    selected.set(channel.channelNumber, name.slice(0, 100) || `Camera ${channel.channelNumber}`);
  }

  const existingCameras = await Camera.find({ nvr: nvr._id });
  const existingByChannel = new Map(existingCameras.map((camera) => [camera.channelNumber, camera]));
  const adapter = getAdapter(nvr.brand, nvr.connectionType);
  if (!adapter.supportsDiscovery) {
    throw new ApiError(400, 'Camera selection is available only for NVRs that support channel discovery');
  }
  const credentials = credsFromDevice(nvr);
  const created: typeof existingCameras = [];
  let enabled = 0;
  let disabled = 0;

  for (const [channelNumber, name] of selected) {
    const existingCamera = existingByChannel.get(channelNumber);
    if (existingCamera) {
      let changed = false;
      if ([channelNumber * 100 + 1, channelNumber * 100 + 2].includes(Number(existingCamera.name))) {
        existingCamera.name = name;
        changed = true;
      }
      if (!existingCamera.isEnabled) {
        existingCamera.isEnabled = true;
        enabled += 1;
        changed = true;
      }
      if (changed) await existingCamera.save();
      continue;
    }

    const createdCamera = await Camera.create({
      name,
      cameraId: `nvr-${nvr._id}-${channelNumber}`,
      location: nvr.location,
      nvr: nvr._id,
      channelNumber,
      connectionType: nvr.connectionType,
      isEnabled: true,
      rtspUrlEnc: encrypt(adapter.getLiveStreamUrl(credentials, channelNumber)),
      streamKey: `nvr-${nvr._id.toString().slice(-6)}-ch${channelNumber}`,
      status: 'unknown',
    });
    created.push(createdCamera);
  }

  for (const camera of existingCameras) {
    if (camera.isEnabled && !selected.has(camera.channelNumber ?? -1)) {
      camera.isEnabled = false;
      await camera.save();
      await removeStreamPath(camera.streamKey);
      disabled += 1;
    }
  }

  await AuditLog.create({
    actor: req.user!.sub, actorRole: req.user!.role, action: 'nvr.cameras.select',
    resource: 'NvrDevice', resourceId: nvr._id.toString(), ip: req.ip,
  });

  res.json({
    success: true,
    added: created.length,
    enabled,
    disabled,
    cameras: [...created, ...existingCameras].map((camera) => sanitizeCamera(camera.toObject())),
  });
});

// ---- Direct RTSP: save NVR + cameras in one shot ----

export const createDirectRtspNvr = asyncHandler(async (req: Request, res: Response) => {
  if (req.user!.role !== 'admin') throw new ApiError(403, 'Admin only');
  const { brand, name, location, publicIp, cameras } = req.body;

  if (!BRANDS.includes(brand)) throw new ApiError(400, 'Unsupported NVR brand');
  if (!name || !location || !publicIp) throw new ApiError(400, 'Name, location and public IP are required');
  if (!Array.isArray(cameras) || cameras.length === 0) throw new ApiError(400, 'At least one camera is required');

  // Validate RTSP URLs
  for (const cam of cameras) {
    if (!cam.name || !cam.rtspUrl) throw new ApiError(400, 'Each camera requires a name and RTSP URL');
    if (!/^rtsp:\/\//i.test(cam.rtspUrl)) throw new ApiError(400, `Invalid RTSP URL for camera "${cam.name}"`);
  }

  const dup = await NvrDevice.findOne({ publicIp, connectionType: 'direct_rtsp' });
  if (dup) throw new ApiError(409, 'An NVR with this IP is already configured for Direct RTSP');

  const nvr = await NvrDevice.create({
    brand,
    name,
    location,
    publicIp,
    connectionType: 'direct_rtsp',
    playbackSupported: false,
    createdBy: req.user!.sub,
  });

  const created = [];
  for (let i = 0; i < cameras.length; i++) {
    const cam = cameras[i];
    const streamKey = `direct-${nvr._id.toString().slice(-6)}-${i + 1}`;
    const camera = await Camera.create({
      name: cam.name,
      cameraId: `direct-${nvr._id}-${i + 1}`,
      location,
      nvr: nvr._id,
      channelNumber: i + 1,
      connectionType: 'direct_rtsp',
      isEnabled: true,
      rtspUrlEnc: encrypt(cam.rtspUrl),
      streamKey,
      status: 'unknown',
    });
    created.push(camera);
  }

  await AuditLog.create({
    actor: req.user!.sub, actorRole: req.user!.role, action: 'nvr.create_direct',
    resource: 'NvrDevice', resourceId: nvr._id.toString(), ip: req.ip,
  });

  res.status(201).json({ success: true, nvr: sanitize(nvr.toObject()), cameras: created.map((c) => sanitizeCamera(c.toObject())) });
});

// ---- Test a single RTSP stream (direct mode) ----

export const testRtspStream = asyncHandler(async (req: Request, res: Response) => {
  if (req.user!.role !== 'admin') throw new ApiError(403, 'Admin only');
  const { rtspUrl } = req.body;
  if (!rtspUrl || !/^rtsp:\/\//i.test(rtspUrl)) throw new ApiError(400, 'Valid RTSP URL required');

  // Attempt a TCP connection to the RTSP host:port parsed from the URL
  try {
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
    res.json({ success: ok, ok, message: ok ? 'RTSP endpoint reachable' : 'RTSP endpoint unreachable (timeout or refused)' });
  } catch {
    res.json({ success: false, ok: false, message: 'Invalid RTSP URL' });
  }
});

function sanitizeCamera(camera: object) {
  const { rtspUrlEnc, usernameEnc, passwordEnc, ipAddress, rtspPort, rtspPath, ...rest } = camera as Record<string, unknown>;
  return rest;
}
