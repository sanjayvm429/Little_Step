import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

export type JwtPayload = {
  sub: string;
  role: 'parent' | 'teacher' | 'admin';
  email: string;
};

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwt.accessSecret) as JwtPayload;
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwt.refreshSecret) as JwtPayload;
}

export function signStreamToken(cameraId: string, userId: string): string {
  return jwt.sign(
    { cameraId, userId, purpose: 'stream' },
    config.streamTokenSecret,
    { expiresIn: config.streamTokenExpiresIn as jwt.SignOptions['expiresIn'] }
  );
}

export function verifyStreamToken(token: string): { cameraId: string; userId: string; expiresAt: number } {
  const decoded = jwt.verify(token, config.streamTokenSecret) as {
    cameraId: string;
    userId: string;
    purpose: string;
    exp?: number;
  };
  if (decoded.purpose !== 'stream') throw new Error('Invalid stream token');
  if (typeof decoded.exp !== 'number') throw new Error('Stream token has no expiration');
  return { cameraId: decoded.cameraId, userId: decoded.userId, expiresAt: decoded.exp * 1000 };
}

export function signPlaybackToken(
  cameraId: string,
  userId: string,
  role: JwtPayload['role'],
  sessionId: string,
  streamKey: string
): string {
  return jwt.sign(
    { cameraId, userId, role, sessionId, streamKey, purpose: 'playback' },
    config.streamTokenSecret,
    { expiresIn: '4h' }
  );
}

export function verifyPlaybackToken(token: string): {
  cameraId: string;
  userId: string;
  role: JwtPayload['role'];
  sessionId: string;
  streamKey: string;
} {
  const decoded = jwt.verify(token, config.streamTokenSecret) as {
    cameraId: string;
    userId: string;
    role: JwtPayload['role'];
    sessionId: string;
    streamKey: string;
    purpose: string;
  };
  if (
    decoded.purpose !== 'playback' ||
    !decoded.cameraId ||
    !decoded.userId ||
    !['admin', 'teacher', 'parent'].includes(decoded.role) ||
    !decoded.sessionId ||
    !decoded.streamKey
  ) {
    throw new Error('Invalid playback token');
  }
  return {
    cameraId: decoded.cameraId,
    userId: decoded.userId,
    role: decoded.role,
    sessionId: decoded.sessionId,
    streamKey: decoded.streamKey,
  };
}
