// Initialize Sentry before importing other modules
import './sentry.js';

import { NestExpressApplication } from '@nestjs/platform-express';
import { ApiModule } from './api.module.js';
import { NestFactory } from '@nestjs/core';

const app = await NestFactory.create<NestExpressApplication>(ApiModule, {
  forceCloseConnections: true,
});

await app.listen(Number(process.env.API_PORT ?? 3001));
