import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { Request, Response } from 'express';
import { Camera } from '../models/Camera.js';
import { ApiError, asyncHandler } from '../utils/errors.js';
import { config } from '../config/index.js';

type FaceFile = Express.Multer.File;
type FaceFiles = Record<string, FaceFile[]>;

function faceUrl(path: string): string {
  const { url, secret } = config.faceService;
  if (!url || !secret || secret.length < 32) {
    throw new ApiError(503, 'Face recognition is not configured on the server');
  }
  return `${url.replace(/\/+$/, '')}${path}`;
}

function queryString(query: Request['query']): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string') params.set(key, value);
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

async function callFaceService<T = Record<string, unknown>>(
  method: AxiosRequestConfig['method'],
  path: string,
  data?: unknown,
  configOverrides: AxiosRequestConfig = {},
): Promise<AxiosResponse<T>> {
  try {
    return await axios.request<T>({
      method,
      url: faceUrl(path),
      data,
      timeout: 30000,
      headers: { 'X-Face-Service-Secret': config.faceService.secret },
      ...configOverrides,
    });
  } catch (error) {
    if (!axios.isAxiosError(error)) throw error;
    const status = error.response?.status;
    const body = error.response?.data as { detail?: unknown } | undefined;
    const detail = typeof body?.detail === 'string' ? body.detail : undefined;
    if (status && status >= 400 && status < 500) {
      throw new ApiError(status, detail ?? 'The face service rejected the request');
    }
    throw new ApiError(503, 'The face recognition service is unavailable');
  }
}

function appendUpload(form: FormData, field: string, file?: FaceFile): void {
  if (!file) throw new ApiError(400, `Missing ${field.replace('_image', '')} image`);
  form.append(
    field,
    new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }),
    file.originalname,
  );
}

function imageForm(req: Request, includeEmployeeFields: boolean): FormData {
  const form = new FormData();
  const fields: Record<string, string | undefined> = includeEmployeeFields
    ? {
        employee_id: req.body.employee_id,
        full_name: req.body.full_name,
        email: req.body.email,
        department: req.body.department,
        designation: req.body.designation,
        contact_number: req.body.contact_number,
        registration_date: req.body.registration_date,
        consent_given: req.body.consent_given,
      }
    : {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) form.append(key, value);
  }

  const files = req.files as FaceFiles | undefined;
  appendUpload(form, 'front_image', files?.front_image?.[0]);
  appendUpload(form, 'left_image', files?.left_image?.[0]);
  appendUpload(form, 'right_image', files?.right_image?.[0]);
  return form;
}

function safeCamera(camera: Record<string, unknown>) {
  return {
    camera_id: camera.camera_id,
    external_camera_id: camera.external_camera_id,
    camera_name: camera.camera_name,
    mediamtx_path: camera.mediamtx_path,
    department: camera.department,
    camera_purpose: camera.camera_purpose,
    status: camera.status,
    stream_status: camera.stream_status,
    last_frame_at: camera.last_frame_at,
    last_error: camera.last_error ? 'Stream unavailable; check server logs.' : null,
  };
}

async function syncCameras() {
  const cameras = await Camera.find().select(
    'name cameraId streamKey isEnabled',
  );
  const baseUrl = config.faceService.mediamtxRtspBaseUrl.replace(/\/+$/, '');
  const items = cameras.map((camera) => ({
    camera_id: camera._id.toString(),
    external_camera_id: camera.cameraId,
    camera_name: camera.name,
    stream_url: `${baseUrl}/${encodeURIComponent(camera.streamKey)}`,
    mediamtx_path: camera.streamKey,
    department: null,
    status: camera.isEnabled ? 'active' : 'inactive',
  }));
  const response = await callFaceService<{ cameras: Record<string, unknown>[] }>(
    'post',
    '/cameras/sync',
    items,
  );
  return response.data.cameras.map(safeCamera);
}

export const getFaceHealth = asyncHandler(async (_req: Request, res: Response) => {
  const response = await callFaceService('get', '/health');
  res.json(response.data);
});

export const listEmployees = asyncHandler(async (req: Request, res: Response) => {
  const response = await callFaceService('get', `/employees${queryString(req.query)}`);
  res.json(response.data);
});

export const getEmployee = asyncHandler(async (req: Request, res: Response) => {
  const response = await callFaceService(
    'get',
    `/employees/${encodeURIComponent(req.params.employeeId)}`,
  );
  res.json(response.data);
});

export const validateFace = asyncHandler(async (req: Request, res: Response) => {
  const file = (req as Request & { file?: FaceFile }).file;
  if (!file) throw new ApiError(400, 'An image is required');
  const form = new FormData();
  form.append('position', req.body.position ?? 'front');
  appendUpload(form, 'image', file);
  const response = await callFaceService('post', '/faces/validate', form);
  res.json(response.data);
});

export const createEmployee = asyncHandler(async (req: Request, res: Response) => {
  const response = await callFaceService(
    'post',
    '/employees',
    imageForm(req, true),
  );
  res.status(response.status).json(response.data);
});

export const updateEmployee = asyncHandler(async (req: Request, res: Response) => {
  const response = await callFaceService(
    'put',
    `/employees/${encodeURIComponent(req.params.employeeId)}`,
    req.body,
  );
  res.json(response.data);
});

export const updateEmployeeFaces = asyncHandler(async (req: Request, res: Response) => {
  const response = await callFaceService(
    'put',
    `/employees/${encodeURIComponent(req.params.employeeId)}/faces`,
    imageForm(req, false),
  );
  res.json(response.data);
});

export const deleteEmployeeFaceData = asyncHandler(async (req: Request, res: Response) => {
  const response = await callFaceService(
    'delete',
    `/employees/${encodeURIComponent(req.params.employeeId)}/face-data`,
  );
  res.json(response.data);
});

export const getEmployeeFaceImage = asyncHandler(async (req: Request, res: Response) => {
  const response = await callFaceService<ArrayBuffer>(
    'get',
    `/employees/${encodeURIComponent(req.params.employeeId)}/faces/${encodeURIComponent(req.params.position)}`,
    undefined,
    { responseType: 'arraybuffer' },
  );
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(Buffer.from(response.data));
});

export const createRegistrationLink = asyncHandler(async (req: Request, res: Response) => {
  let dashboardUrl: URL;
  try {
    dashboardUrl = new URL(config.clientUrl);
  } catch {
    throw new ApiError(503, 'Mobile registration requires a valid dashboard URL in CLIENT_URL');
  }
  const hostname = dashboardUrl.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const isLoopback = hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname === '::1'
    || hostname === '::'
    || hostname === '0.0.0.0'
    || /^127(?:\.\d{1,3}){3}$/.test(hostname);
  if (dashboardUrl.protocol !== 'https:' || isLoopback) {
    throw new ApiError(
      503,
      'Mobile registration requires CLIENT_URL to be a reachable HTTPS dashboard address, not localhost',
    );
  }
  const response = await callFaceService('post', '/registration-links', {
    ...req.body,
    created_by: req.user!.sub,
  });
  const result = response.data as Record<string, unknown>;
  const link = new URL('/mobile-register', config.clientUrl);
  link.hash = String(result.token);
  res.status(response.status).json({ ...result, registration_url: link.toString() });
});

export const getRegistrationLinkStatus = asyncHandler(async (req: Request, res: Response) => {
  const response = await callFaceService(
    'get',
    `/registration-links/${encodeURIComponent(req.params.tokenId)}/status`,
  );
  res.json(response.data);
});

export const getMobileRegistrationInfo = asyncHandler(async (req: Request, res: Response) => {
  const token = typeof req.body.token === 'string' ? req.body.token : '';
  if (!token || token.length > 128) throw new ApiError(400, 'Registration link is invalid');
  const response = await callFaceService(
    'get',
    `/mobile-register/${encodeURIComponent(token)}`,
  );
  const registration = response.data.registration as Record<string, unknown>;
  res.json({
    success: true,
    registration: {
      employee_id: registration.employee_id,
      full_name: registration.full_name,
      expires_at: registration.expires_at,
      mode: registration.mode,
    },
  });
});

export const submitMobileRegistration = asyncHandler(async (req: Request, res: Response) => {
  const token = typeof req.body.token === 'string' ? req.body.token : '';
  if (!token || token.length > 128) throw new ApiError(400, 'Registration link is invalid');
  const files = req.files as FaceFiles | undefined;
  const form = new FormData();
  form.append('consent_confirmed', req.body.consent_confirmed === 'true' ? 'true' : 'false');
  appendUpload(form, 'front_image', files?.front_image?.[0]);
  appendUpload(form, 'left_image', files?.left_image?.[0]);
  appendUpload(form, 'right_image', files?.right_image?.[0]);
  const response = await callFaceService(
    'post',
    `/mobile-register/${encodeURIComponent(token)}/submit`,
    form,
  );
  res.status(response.status).json(response.data);
});

export const listFaceCameras = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ success: true, cameras: await syncCameras() });
});

export const updateFaceCamera = asyncHandler(async (req: Request, res: Response) => {
  const response = await callFaceService(
    'put',
    `/cameras/${encodeURIComponent(req.params.cameraId)}`,
    {
      ...req.body,
      department: req.body.department === null ? '' : req.body.department,
    },
  );
  res.json({ ...response.data, camera: safeCamera(response.data.camera as Record<string, unknown>) });
});

export const getFaceAttendance = asyncHandler(async (req: Request, res: Response) => {
  const response = await callFaceService('get', `/attendance${queryString(req.query)}`);
  res.json(response.data);
});

export const getRecognitionStatus = asyncHandler(async (_req: Request, res: Response) => {
  const response = await callFaceService<{
    cameras: Record<string, unknown>[];
    [key: string]: unknown;
  }>('get', '/recognition/status');
  res.json({
    ...response.data,
    cameras: response.data.cameras.map(safeCamera),
  });
});

export const getUnknownSnapshot = asyncHandler(async (req: Request, res: Response) => {
  const response = await callFaceService<ArrayBuffer>(
    'get',
    `/recognition/unknowns/${encodeURIComponent(req.params.eventId)}/snapshot`,
    undefined,
    { responseType: 'arraybuffer' },
  );
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(Buffer.from(response.data));
});

export const updateRecognitionSettings = asyncHandler(async (req: Request, res: Response) => {
  const response = await callFaceService('put', '/recognition/settings', req.body);
  res.json(response.data);
});

export const processRecognitionFrame = asyncHandler(async (req: Request, res: Response) => {
  const file = (req as Request & { file?: FaceFile }).file;
  if (!file) throw new ApiError(400, 'A frame image is required');
  const form = new FormData();
  form.append('camera_id', String(req.body.camera_id ?? ''));
  appendUpload(form, 'frame_image', file);
  const response = await callFaceService('post', '/recognition/process-frame', form);
  res.json(response.data);
});
