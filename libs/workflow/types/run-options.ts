import { DeduplicationOptions } from 'bullmq';
import { Trigger } from '@prisma/client';

export interface RunOptions<P = any> {
  /**
   * The ID of the user that initiated the workflow run.
   * If not provided, the run will be associated with the system user.
   */
  userId?: number;
  // Sentry
  sentry?: {
    trace?: string;
    baggage?: string;
  };
  // BullMQ
  parentId?: number;
  scheduledAt?: Date;
  maxRetries?: number;
  deduplication?: DeduplicationOptions;
  priority?: number;
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
