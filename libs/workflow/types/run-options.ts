import { DeduplicationOptions } from 'bullmq';

export interface RunOptions<P = any> {
  // Sentry
  sentry?: {
    trace?: string;
    baggage?: string;
  };
  // BullMQ
  scheduledAt?: Date;
  maxRetries?: number;
  deduplication?: DeduplicationOptions;
  // Data
  /**
   * Context data to pass to the workflow, can be used to store and retrieve data during execution. Avoid using large data here as it is stored in Redis.
   */
  context?: any;
  /**
   * Payload data to pass to the workflow, this is the main data that the workflow will process.
   * It can be any type of data, but should be serializable.
   */
  payload?: P;
}
