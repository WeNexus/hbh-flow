// Initialize Sentry before importing other modules
import './sentry.js';

import { WorkerModule } from './worker.module.js';
import { NestFactory } from '@nestjs/core';

await NestFactory.createApplicationContext(WorkerModule);
