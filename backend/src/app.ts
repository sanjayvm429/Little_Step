import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { config } from './config/index.js';
import { notFound, errorHandler } from './utils/errors.js';

import authRoutes from './routes/auth.js';
import childrenRoutes from './routes/children.js';
import classroomsRoutes from './routes/classrooms.js';
import camerasRoutes from './routes/cameras.js';
import attendanceRoutes from './routes/attendance.js';
import activitiesRoutes from './routes/activities.js';
import notificationsRoutes from './routes/notifications.js';
import messagesRoutes from './routes/messages.js';
import announcementsRoutes from './routes/announcements.js';
import pickupRoutes from './routes/pickup.js';
import incidentsRoutes from './routes/incidents.js';
import adminRoutes from './routes/admin.js';
import nvrRoutes from './routes/nvrs.js';
import playbackRoutes from './routes/playback.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(compression());
  app.use(
    cors({
      origin: config.clientUrl,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  if (config.env !== 'test') {
    app.use(morgan('dev', { skip: (req) => req.path.includes('/hls/') }));
  }

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path.includes('/cameras/') && req.path.includes('/hls/'),
  });

  const streamLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5000,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/cameras', (req, res, next) => {
    if (req.path.includes('/hls/')) return streamLimiter(req, res, next);
    next();
  });
  app.use('/api', limiter);

  app.get('/api/health', (_req, res) => res.json({ success: true, status: 'ok' }));

  app.use('/api/auth', authRoutes);
  app.use('/api/children', childrenRoutes);
  app.use('/api/classrooms', classroomsRoutes);
  app.use('/api/cameras', camerasRoutes);
  app.use('/api/attendance', attendanceRoutes);
  app.use('/api/activities', activitiesRoutes);
  app.use('/api/notifications', notificationsRoutes);
  app.use('/api/messages', messagesRoutes);
  app.use('/api/announcements', announcementsRoutes);
  app.use('/api/pickup-authorizations', pickupRoutes);
  app.use('/api/incidents', incidentsRoutes);
  app.use('/api/playback', playbackRoutes);
  app.use('/api/nvrs', nvrRoutes);
  app.use('/api/admin', adminRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
