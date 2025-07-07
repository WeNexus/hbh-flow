import { Job as BullJob, JobProgress, Queue, Worker } from 'bullmq';
import { Job as DBJob, PrismaClient } from '@prisma/client';
import { StepInfoSchema } from '../schema/step-info.schema';
import { JobPayload } from '../types/job-payload';

export class WorkflowBase<P = any> {
  // We're keeping queue, worker, bullJob and dbJob private to prevent direct access from outside the class.

  // Static queue shared across all instances of WorkflowBase.
  private static readonly queue: Queue<JobPayload>;
  // Static worker shared across all instances of WorkflowBase.
  private static readonly worker: Worker<JobPayload>;
  protected needsRerun: boolean = false;
  protected cancelled: boolean = false;
  protected paused: boolean = false;
  protected delayed = 0;
  private readonly prisma: PrismaClient;
  // Also static, but we need it for non-static methods declared in the WorkflowBase.
  private readonly queue: Queue<JobPayload>;
  // Also static, but we need it for non-static methods declared in the WorkflowBase.
  private readonly worker: Worker<JobPayload>;
  private readonly steps: StepInfoSchema[];
  private readonly bullJob: BullJob<JobPayload>;
  private readonly dbJob: DBJob;

  get progress() {
    return this.bullJob.progress;
  }

  set progress(value: JobProgress) {
    void this.bullJob.updateProgress(value);
  }

  get bullId() {
    return this.bullJob.id;
  }

  get dbId() {
    return this.dbJob.id;
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

  setContext(value: any) {
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
   * @param block If true, no other jobs will be processed until the workflow is resumed.
   */
  async pause(block?: boolean) {
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
   * @param delay The number of milliseconds to wait before rerunning the step.
   */
  rerun(delay: number) {
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

  async getResult<T = any>(step: string): Promise<T> {
    const row = await this.prisma.jobStep.findFirst({
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
