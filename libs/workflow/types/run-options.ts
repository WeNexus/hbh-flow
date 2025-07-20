import { DeduplicationOptions } from 'bullmq';
import { Trigger } from '@prisma/client';

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
   * The trigger that initiated the workflow run.
   */
  trigger?: Trigger;
  /**
   * The ID of the trigger that initiated the workflow run.
   */
  triggerId?: string;
  /**
   * A draft job is a job that is not yet ready to be executed.
   */
  draft?: boolean;
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
