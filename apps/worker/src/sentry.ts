import * as Sentry from '@sentry/nestjs';
import process from 'node:process';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: 'Worker',
  // Tracing
  tracesSampleRate: 1.0, //  Capture 100% of the transactions

  // Setting this option to true will send default PII data to Sentry.
  // For example, automatic IP address collection on events
  sendDefaultPii: true,
});
