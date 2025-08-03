import { AppType } from '#lib/core/types/app-type';
import * as Sentry from '@sentry/nestjs';
import { DelayedError } from 'bullmq';
import process from 'node:process';

/**
 * Initializes Sentry for error tracking and performance monitoring.
 *
 * @param appType - The type of the application (e.g., 'Worker', 'API').
 */
export function initSentry(appType: AppType) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: appType,
    // Tracing
    tracesSampleRate: 1.0, //  Capture 100% of the transactions

    // Setting this option to true will send default PII data to Sentry.
    // For example, automatic IP address collection on events
    sendDefaultPii: true,
    beforeSend(event, hint) {
      if (hint.originalException instanceof DelayedError) {
        return null;
      }

      return event;
    },
  });
}
