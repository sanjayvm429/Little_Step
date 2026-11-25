import 'dotenv/config';
import crypto from 'crypto';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '5000', 10),
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:5173',
  mongoUri: required('MONGO_URI'),
  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET'),
    refreshSecret: required('JWT_REFRESH_SECRET'),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  encryptionKey: required('ENCRYPTION_KEY'),
  mediamtx: {
    apiUrl: process.env.MEDIAMTX_API_URL ?? 'http://localhost:9997',
    webrtcUrl: process.env.MEDIAMTX_WEBRTC_URL ?? 'ws://localhost:8889',
    hlsUrl: process.env.MEDIAMTX_HLS_URL ?? 'http://localhost:8888',
    executablePath: process.env.MEDIAMTX_EXECUTABLE_PATH,
    localConfigPath: process.env.MEDIAMTX_LOCAL_CONFIG_PATH,
  },
  streamTokenSecret: required('STREAM_TOKEN_SECRET'),
  streamTokenExpiresIn: process.env.STREAM_TOKEN_EXPIRES_IN ?? '5m',
  uploadDir: process.env.UPLOAD_DIR ?? 'uploads',
  maxUploadSizeMb: parseInt(process.env.MAX_UPLOAD_SIZE_MB ?? '5', 10),
  notificationProvider: process.env.NOTIFICATION_PROVIDER ?? 'console',
  faceService: {
    url: process.env.FACE_SERVICE_URL,
    secret: process.env.FACE_SERVICE_SECRET,
    mediamtxRtspBaseUrl: process.env.FACE_SERVICE_RTSP_BASE_URL ?? 'rtsp://mediamtx:8554',
  },
};

// AES-256-GCM helpers for encrypting camera credentials at rest
const key = Buffer.from(config.encryptionKey, 'hex');
if (key.length !== 32) {
  throw new Error('ENCRYPTION_KEY must be 64 hex chars (32 bytes)');
}

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decrypt(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
}
