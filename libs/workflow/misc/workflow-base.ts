import { StepInfoSchema } from '#lib/workflow/schema';
import { PrismaService } from '#lib/core/services';
import { JobPayload } from '#lib/workflow/types';
import { Job as DBJob } from '@prisma/client';
import { ModuleRef } from '@nestjs/core';

import {
  Job as BullJob,
  JobProgress,
  QueueEvents,
  Queue,
  Worker,
} from 'bullmq';

/**
 * Base class for workflows.
 * You should extend this class to create your own workflows.
 * This class provides methods to control the workflow execution, such as pausing, delaying, rerunning, and cancelling the workflow.
 */

export abstract class WorkflowBase<P = any> {
  protected constructor(private readonly moduleRef: ModuleRef) {}

  // We're keeping queue, worker, bullJob and dbJob private to prevent direct access from outside the class.
  /**
   * Static queue events shared across all instances of a workflow.
   * This won't be available until NestJS calls OnApplicationBootstrap.
   */
  public static queueEvents: QueueEvents;

  /**
   * Static queue shared across all instances of a workflow.
   * This won't be available until NestJS calls OnApplicationBootstrap.
   */
  public static queue: Queue<JobPayload>;

  /**
   * Static worker shared across all instances of a workflow.
   * This won't be available until NestJS calls OnApplicationBootstrap.
   */
  public static worker: Worker<JobPayload>;

  protected needsRerun: boolean = false;
  protected cancelled: boolean = false;
  protected paused: boolean = false;
  protected delayed = 0;

  public queue: Queue<JobPayload>;
  public worker: Worker<JobPayload>;

  public static steps: StepInfoSchema[];
  public bullJob: BullJob<JobPayload>;
  public dbJob: DBJob;

  /**
   * The progress of the workflow.
   */
  get progress() {
    return this.bullJob.progress;
  }

  /**
   * Updates the progress of the workflow.
   *
   * @param value The progress of the workflow.
   */
  set progress(value: JobProgress) {
    void this.bullJob.updateProgress(value);
  }

  /**
   * The payload of the workflow, which contains the data that is passed to the workflow when it is started.
   * Contains trigger information, such as the event name, source, and any additional data.
   */
  get payload() {
    return this.dbJob.payload as P;
  }

  /**
   *  The context of the workflow, which can be used to store and retrieve data during the workflow execution.
   *  Avoid using this for large data, as it is stored in Redis and can affect performance.
   */
  get context(): any {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.bullJob.data.context;
  }

  /**
   * Sets the context of the workflow.
   *
   * @param value - The value to set as the context.
   */
  setContext(value: any): Promise<void> {
    return this.bullJob.updateData({
      dbJobId: this.bullJob.data.dbJobId,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      context: value,
    });
  }

  /**
   * Pauses the workflow execution. The step currently being executed will finish, then the workflow will be paused.
   * It has to be manually resumed later. When resumed, it will continue from the next step.
   * This is useful for temporarily halting the workflow without losing its state.
   * Note: This method does not actually pause the execution in BullMQ, it adds very long delay so the workflow is basically paused.
   *
   * @param block If true, no other jobs will be processed until the workflow is resumed.
   */
  async pause(block?: boolean): Promise<void> {
    if (this.delayed > 0) {
      throw new Error("Can't pause a workflow that is already delayed.");
    }

    if (this.cancelled) {
      throw new Error("Can't pause a cancelled workflow.");
    }

    if (this.needsRerun) {
      throw new Error("Can't pause a workflow, after a rerun was scheduled.");
    }

    if (block) {
      await this.queue.pause();
    }

    this.delayed = 1000 * 60 * 60 * 24 * 365 * 10; // 10 years
    this.paused = true;
  }

  /**
   * Delays the workflow execution for a specified number of milliseconds.
   * The step currently being executed will finish, then the workflow will be delayed.
   * This method is useful for adding a delay before the next step in the workflow.
   * @param ms The number of milliseconds to delay the workflow execution.
   */
  delay(ms: number) {
    if (this.paused) {
      throw new Error("Can't delay a paused workflow.");
    }

    if (this.cancelled) {
      throw new Error("Can't delay a cancelled workflow.");
    }

    if (this.needsRerun) {
      throw new Error("Can't delay a workflow, after a rerun was scheduled.");
    }

    this.delayed = ms;
  }

  /**
   * Reruns the current step after a specified delay.
   *
   * @param delay The number of milliseconds to wait before rerunning the step.
   */
  rerun(delay: number): void {
    if (this.paused) {
      throw new Error("Can't rerun a step in a paused workflow.");
    }

    if (this.cancelled) {
      throw new Error("Can't rerun a step in a cancelled workflow.");
    }

    if (this.delayed > 0) {
      throw new Error("Can't rerun a step in a delayed workflow.");
    }

    this.delayed = delay;
    this.needsRerun = true;
  }

  /**
   * Cancels the workflow execution.
   * The step currently being executed will finish, then the workflow will be cancelled.
   * This method is useful for stopping the workflow execution entirely.
   *
   * @param result The result of the step that is currently being executed.
   * @returns The result of the cancellation.
   */
  cancel(result?: any): any {
    if (this.paused) {
      throw new Error("Can't cancel a paused workflow.");
    }

    if (this.delayed > 0) {
      throw new Error("Can't cancel a delayed workflow.");
    }

    if (this.needsRerun) {
      throw new Error("Can't cancel a workflow, after a rerun was scheduled.");
    }

    this.cancelled = true;

    return result;
  }

  /**
   * Retrieves the result of a specific step in the workflow.
   * This method queries the database for the result of the step with the given name.
   *
   * @param step The name of the step whose result is to be retrieved.
   * @returns A promise that resolves to the result of the step.
   */
  async getResult<T = any>(step: string): Promise<T> {
    const row = await this.moduleRef
      .get(PrismaService, { strict: false })
      .jobStep.findFirst({
        where: {
          jobId: this.dbJob.id,
          name: step,
        },
        select: {
          result: true,
        },
      });

    return row?.result as T;
  }
}
