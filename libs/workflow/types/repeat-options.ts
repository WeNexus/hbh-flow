import { RunOptions } from './run-options.js';
import { Timezone } from './timezone.js';

export interface RepeatOptions
  extends Omit<RunOptions, 'deduplication' | 'scheduledAt' | 'payload'> {
  /**
   * This should be used when a workflow class name has changed, so the workflow manager can move the records from the old name to the new one.
   */
  oldName?: string;

  repeat: {
    /**
     * Cron pattern for scheduling e.g. '0 0 * * *' for daily at midnight
     */
    pattern: string;
    /**
     * Optional timezone for the cron job, e.g. 'America/New_York'
     */
    timezone?: Timezone;
    /**
     * Optional limit for the number of jobs to run, useful for limiting the number of executions
     */
    limit?: number;
    /**
     * If true, the job will be executed immediately after being added to the queue.
     */
    immediate?: boolean;
    /**
     * This should be used when the cron pattern has changed. Otherwise, it will create a new schedule and the old jobs will not be removed.
     */
    oldPattern?: string;
  };
}
