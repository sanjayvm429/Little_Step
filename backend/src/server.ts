import mongoose from 'mongoose';
import { createApp } from './app.js';
import { config } from './config/index.js';

async function main() {
  await mongoose.connect(config.mongoUri);
  console.log('MongoDB connected');

  const app = createApp();
  app.listen(config.port, () => {
    console.log(`LittleSteps API listening on http://localhost:${config.port}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
