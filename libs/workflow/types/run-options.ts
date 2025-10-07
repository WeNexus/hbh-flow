import { DBJobSlim } from '#lib/workflow/types/db-job-slim';
import { DeduplicationOptions } from 'bullmq';
import { Trigger } from '@prisma/client';

export interface RunOptions<P = any> {
  /**
   * The ID of the user that initiated the workflow run.
   * If not provided, the run will be associated with the system user.
   */
  userId?: number;
  needResponse?: boolean;
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
  beforeQueue?: (job: DBJobSlim) => any;
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
  /**
   * Specific steps to execute within the job. If not provided, the entire job will be executed.
   */
  steps?: string[];
  /**
   * Step identifier to start the execution from. If provided, the job will be executed starting from this step onward. Either "steps" or "from" can be provided, but not both.
   */
  from?: string;
  /**
   * Step identifier to end the execution at. If provided, the job will be executed up to and including this step. Either "steps" or "to" can be provided, but not both.
   */
  to?: string;
}
