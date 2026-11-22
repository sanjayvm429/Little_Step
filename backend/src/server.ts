import mongoose from 'mongoose';
import { createApp } from './app.js';
import { config } from './config/index.js';
import {
  ensureMediaMtxAvailable,
  startStreamSelfHealing,
  stopLocalMediaMtx,
} from './services/streamManager.js';

async function main() {
  await mongoose.connect(config.mongoUri);
  console.log('MongoDB connected');

  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`LittleSteps API listening on http://localhost:${config.port}`);
  });
  await ensureMediaMtxAvailable();
  const streamHealthTimer = startStreamSelfHealing();

  const shutdown = () => {
    clearInterval(streamHealthTimer);
    stopLocalMediaMtx();
    server.close(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
