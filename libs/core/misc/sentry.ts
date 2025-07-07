import { AppType } from '../types/app-type';
import * as Sentry from '@sentry/nestjs';
import process from 'node:process';

export function initSentry(appType: AppType) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: appType,
    // Tracing
    tracesSampleRate: 1.0, //  Capture 100% of the transactions

    // Setting this option to true will send default PII data to Sentry.
    // For example, automatic IP address collection on events
    sendDefaultPii: true,
  });
}
