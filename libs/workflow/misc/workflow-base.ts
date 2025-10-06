import type { WorkflowService } from '#lib/workflow/workflow.service';
import type { InputJsonValue } from '@prisma/client/runtime/client';
import { JobPayload, JobResMeta } from '#lib/workflow/types';
import { jobResEndSignal } from './job-res-end-signal';
import { StepInfoSchema } from '#lib/workflow/schema';
import { PrismaService } from '#lib/core/services';
import { Job as DBJob } from '@prisma/client';
import { ModuleRef } from '@nestjs/core';
import { Redis } from 'ioredis';

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

export abstract class WorkflowBase<P = any, C = any> {
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

  protected workflowService: WorkflowService;
  protected prisma: PrismaService;
  protected moduleRef: ModuleRef;
  protected redisPub: Redis;

  protected needsRerun: boolean = false;
  protected cancelled: boolean = false;
  protected paused: boolean = false;
  protected delayed = 0;

  public queue: Queue<JobPayload>;
  public worker: Worker<JobPayload>;

  public static steps: StepInfoSchema[];
  public bullJob: BullJob<JobPayload>;
  public dbJob: DBJob;

  protected responseMetaSent = false;
  protected responseEndSent = false;

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
  get context(): C {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.bullJob.data.context;
  }

  /**
   * Sets the context of the workflow.
   *
   * @param value - The value to set as the context.
   */
  setContext(value: C): Promise<void> {
    return this.bullJob.updateData({
      dbJobId: this.bullJob.data.dbJobId,
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
   * @returns A JWT token that can be used to resume the workflow later.
   */
  async pause(block?: boolean): Promise<string> {
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

    return this.workflowService.getJobToken(this.dbJob.id, '12h');
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
  cancel<R>(result?: R): R | undefined {
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
  async getResult<T = any>(step: string): Promise<T | null> {
    const { result: row } = await this.prisma.jobStep.findFirst({
      where: {
        jobId: this.dbJob.id,
        name: step,
      },
      select: {
        result: true,
      },
    });

    return (row?.result as T) ?? null;
  }

  /**
   * Retrieves the resume data of a specific step in the workflow.
   * This method queries the database for the resume data of the step with the given name.
   *
   * @param step The name of the step whose resume data is to be retrieved.
   * @returns A promise that resolves to the resume data of the step.
   */
  async getResumeData<T = any>(step: string): Promise<T | null> {
    const { result: row } = await this.prisma.jobStep.findFirst({
      where: {
        jobId: this.dbJob.id,
        name: step,
      },
      select: {
        resume: true,
      },
    });

    return (row?.resume as T) ?? null;
  }

  /**
   * Sends metadata about the job response.
   * This method publishes the metadata to a Redis channel specific to the job and requester.
   *
   * @param meta The metadata to be sent.
   * @returns A promise that resolves when the metadata has been published.
   */
  async sendResponseMeta(meta: JobResMeta) {
    if (!this.bullJob.data.needResponse) {
      return;
    }

    if (this.responseMetaSent) {
      throw new Error('Response meta has already been sent.');
    }

    this.responseMetaSent = true;

    await this.prisma.job.update({
      where: { id: this.dbJob.id },
      data: {
        responseMeta: meta as InputJsonValue,
      },
      select: {
        id: true,
      },
      uncache: {
        uncacheKeys: [`job:${this.dbJob.id}`],
      },
    });

    await this.redisPub.publish(
      `jr:${this.bullJob.data.requesterRuntimeId}:${this.dbJob.id}`,
      Buffer.from(JSON.stringify(meta)),
    );
  }

  /**
   * Sends chunks of the job response body.
   * This method publishes each chunk to a Redis channel specific to the job and requester.
   * After all chunks are sent, it can optionally send an end signal.
   *
   * @param chunks An array of strings or Buffers representing the chunks of the response body.
   * @param end A boolean indicating whether to send an end signal after the chunks. Defaults to true.
   * @returns A promise that resolves when all chunks (and optionally the end signal) have been published.
   */
  async sendResponse(
    chunks?: (string | Buffer) | (string | Buffer)[],
    end = true,
  ) {
    if (!this.bullJob.data.needResponse) {
      return;
    }

    if (this.responseEndSent) {
      throw new Error('Response has already ended.');
    }

    if (!this.responseMetaSent) {
      throw new Error(
        "Response meta hasn't been sent yet. Call sendResponseMeta first.",
      );
    }

    if (end) {
      this.responseEndSent = true;
    }

    if (chunks) {
      const _chunks = (Array.isArray(chunks) ? chunks : [chunks]).map((c) =>
        typeof c === 'string' ? Buffer.from(c) : c,
      );

      if (_chunks && _chunks.length > 0) {
        for (const chunk of _chunks) {
          await this.redisPub.publish(
            `jr:${this.bullJob.data.requesterRuntimeId}:${this.dbJob.id}`,
            chunk,
          );
        }
      }

      await this.prisma.jobResponseChunk.createMany({
        data: _chunks.map((c) => ({
          jobId: this.dbJob.id,
          data: c,
        })),
      });
    }

    if (end) {
      await this.redisPub.publish(
        `jr:${this.bullJob.data.requesterRuntimeId}:${this.dbJob.id}`,
        jobResEndSignal,
      );
    }
  }
}
