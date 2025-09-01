import { WorkflowConfigSchema } from '#lib/workflow/schema/workflow-config.schema';
import { JobStepStatus, Job as DBJob, JobStatus, Prisma } from '@prisma/client';
import { StepInfoSchema } from '#lib/workflow/schema/step-info.schema';
import type { InputJsonValue } from '@prisma/client/runtime/client';
import { ActivityService, PrismaService } from '#lib/core/services';
import { TriggerType } from '#lib/workflow/misc/trigger-type.enum';
import { RepeatOptions } from '#lib/workflow/types/repeat-options';
import { WorkflowBase } from '#lib/workflow/misc/workflow-base';
import { RunOptions } from '#lib/workflow/types/run-options';
import { JobPayload } from '#lib/workflow/types/job-payload';
import { DBJobSlim } from '#lib/workflow/types/db-job-slim';
import { WorkflowNotFoundException } from './exceptions';
import { APP_TYPE, RUNTIME_ID } from '#lib/core/misc';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { REDIS_PUB } from '#lib/core/redis';
import { EnvService } from '#lib/core/env';
import { isEmpty, merge } from 'lodash-es';
import { AppType } from '#lib/core/types';
import { JwtService } from '@nestjs/jwt';
import * as Sentry from '@sentry/nestjs';
import { Jsonify } from 'type-fest';
import { Redis } from 'ioredis';
import express from 'express';

import {
  ContextIdFactory,
  DiscoveryService,
  ModuleRef,
  Reflector,
} from '@nestjs/core';

import {
  OnApplicationBootstrap,
  Injectable,
  Inject,
  Logger,
} from '@nestjs/common';

import {
  Job as BullJob,
  DelayedError,
  QueueEvents,
  Worker,
  Queue,
} from 'bullmq';

@Injectable()
export class WorkflowService implements OnApplicationBootstrap {
  constructor(
    @Inject(RUNTIME_ID) private readonly runtimeId: string,
    private readonly discoveryService: DiscoveryService,
    @Inject(APP_TYPE) private readonly appType: AppType,
    private readonly activityService: ActivityService,
    @Inject(REDIS_PUB) private readonly redis: Redis,
    private readonly jwtService: JwtService,
    private readonly emitter: EventEmitter2,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
    private readonly moduleRef: ModuleRef,
    private readonly env: EnvService,
  ) {}

  private readonly logger = new Logger(WorkflowService.name);

  public readonly flowsByKey = new Map<string, typeof WorkflowBase>();
  private readonly flowsSet = new Set<typeof WorkflowBase>();
  public readonly flows: (typeof WorkflowBase)[] = [];

  // ---------------------- Internal methods ----------------------

  /**
   * Sets up the workflows, queues, and workers when the application starts.
   *
   * @internal
   */
  async onApplicationBootstrap() {
    // Queues must be set up in both Worker and API, so both can enqueue jobs
    // but only the Worker must process them.

    // getConfig and resolveClass functions can't be used in this method
    const flows = this.discoveryService
      .getProviders()
      .filter(
        (provider) =>
          provider.metatype &&
          this.reflector.get<WorkflowConfigSchema | null>(
            'HBH_FLOW',
            provider.metatype,
          ),
      )
      .map((provider) => provider.metatype as typeof WorkflowBase);

    for (const flow of flows) {
      const config = this.reflector.get<WorkflowConfigSchema | null>(
        'HBH_FLOW',
        flow,
      );

      this.flowsSet.add(flow);
      this.flows.push(flow);
      this.flowsByKey.set(config!.key ?? flow.name, flow);
      // Store the DB flow by key and ID for quick access
      void this.getDBFlow(flow);
    }

    await this.extractSteps();
    await this.setupQueues();
    await this.setupTriggers();

    if (this.appType === AppType.Worker) {
      await this.setupWorkers();
    }
  }

  private async setupQueues() {
    const usedKeys = new Set<string>();

    for (const flow of this.flows) {
      const config = await this.getConfig(flow);
      const key = config?.key ?? flow.name;

      if (usedKeys.has(key)) {
        throw new Error(`Duplicate workflow key detected: ${key}`);
      }

      usedKeys.add(key);

      // Assign the queue to the workflow for later use
      flow.queue = new Queue<JobPayload>(key, {
        defaultJobOptions: {
          // Remove jobs from the queue after completion or failure to reduce memory usage
          removeOnComplete: {
            count: config?.internal ? 1 : 100, // Keep the last 100 completed jobs
            age: 1000 * 60 * 60 * 24, // Keep jobs for 24 hours
          },
          removeOnFail: {
            count: config?.internal ? 5 : 200, // Keep the last 200 failed jobs
            age: 1000 * 60 * 60 * 48, // Keep jobs for 48 hours
          },
          attempts: 1, // Number of retry attempts for failed jobs
        },
        streams: {
          events: {
            maxLen: config?.internal ? 50 : 1000, // Maximum number of events to keep in the stream, use low value to reduce memory usage
          },
        },
        connection: this.redis.duplicate({
          db: this.env.getString('BULL_REDIS_DB'),
          maxRetriesPerRequest: null, // Required for BullMQ
        }),
      });

      flow.queueEvents = new QueueEvents(key, {
        connection: this.redis.duplicate({
          db: this.env.getString('BULL_REDIS_DB'),
          maxRetriesPerRequest: null, // Required for BullMQ
        }),
      });

      flow.queueEvents.on('resumed', () => {
        // In case the workflow was deactivated, the queue must stay paused
        // so we're ensuring that the queue was not resumed mistakenly

        void this.getDBFlow(key)
          .then((dbFlow) => {
            if (!dbFlow?.active) {
              this.logger.warn(
                `Workflow ${flow.name} is not active, pausing the queue.`,
              );

              flow.queue.pause().catch(() => {
                // Ignore errors, the queue might already be paused
              });
            }
          })
          .catch((e: Error) => {
            this.logger.error(
              `Failed to get DB flow for ${flow.name}: ${e.message}`,
              e.stack,
            );
          });
      });
    }

    this.logger.log(
      `Queues set up for: ${this.flows.map((w) => w.name).join(', ')}`,
    );
  }

  private async setupWorkers() {
    for (const flow of this.flows) {
      const queue = flow.queue;
      const config = await this.getConfig(flow);

      // Assign the worker to the workflow for later use
      flow.worker = new Worker<JobPayload>(
        queue.name,
        async (job, token) => {
          const instance = await this.getInstance(flow, true);

          if (!instance) {
            throw new Error(`Workflow instance not found for: ${flow.name}`);
          }

          // @ts-expect-error - protected property
          instance.moduleRef = this.moduleRef;
          // @ts-expect-error - protected property
          instance.workflowService = this;
          // @ts-expect-error - protected property
          instance.redisPub = this.redis;
          // @ts-expect-error - protected property
          instance.prisma = this.prisma;

          const dbFlow = await this.getDBFlow(flow);

          let dbJob: DBJob;

          if (job.data.dbJobId) {
            // Doing upsert, in case the job was deleted from the database
            dbJob = (
              await this.prisma.job.upsert({
                where: { id: job.data.dbJobId },
                create: {
                  id: job.data.dbJobId,
                  workflowId: dbFlow.id,
                  bullId: job.id,
                  status: 'RUNNING',
                  payload: job.data.context as InputJsonValue,
                },
                update: {
                  bullId: job.id,
                  status: 'RUNNING',
                },
                uncache: {
                  uncacheKeys: [`job:${job.data.dbJobId}`],
                },
              })
            ).result;
          } else if (job.data.scheduleId) {
            const { result: schedule } =
              await this.prisma.schedule.findUniqueOrThrow({
                where: { id: job.data.scheduleId },
              });

            if (schedule.skipNextRun > 0) {
              await this.prisma.schedule.update({
                where: { id: schedule.id },
                data: {
                  skipNextRun: {
                    decrement: 1, // Decrement the skipNextRun counter
                  },
                },
              });

              /*await this.activityService.recordActivity({
                userId: 1, // System user ID
                action: 'UPDATE',
                resource: 'SCHEDULE',
                resourceId: schedule.id,
                subAction: 'SKIP_NEXT_RUN',
                updated: schedule,
              });*/

              // If the schedule is set to skip the next run, we skip the job execution
              this.logger.warn(
                `Skipping job ${job.id} for schedule ${schedule.id} due to skipNextRun > 0`,
              );
              return;
            }

            dbJob = (
              await this.prisma.job.upsert({
                where: {
                  bullId: job.id,
                },
                create: {
                  workflowId: dbFlow.id,
                  bullId: job.id,
                  status: 'RUNNING',
                  trigger: 'SCHEDULE',
                  triggerId: schedule.id.toString(),
                },
                update: {
                  status: 'RUNNING',
                },
                uncache: {
                  uncacheKeys: [`job:${job.id}`],
                },
              })
            ).result;
          } else {
            return this.logger.warn(
              `Job ${job.id} does not have a dbJobId or scheduleId, skipping execution.`,
            );
          }

          /*await this.activityService.recordActivity({
            userId: 1, // System user ID
            action: 'UPDATE',
            resource: 'JOB',
            resourceId: dbJob.id,
            subAction: 'EXECUTE',
            updated: dbJob,
          });*/

          instance.bullJob = job;
          instance.dbJob = dbJob;
          instance.queue = queue;
          instance.worker = flow.worker;

          if (dbJob.sentryTrace && dbJob.sentryBaggage) {
            return Sentry.continueTrace(
              {
                sentryTrace: dbJob.sentryTrace,
                baggage: dbJob.sentryBaggage,
              },
              () => this.execute(instance, token),
            );
          }

          return this.execute(instance, token);
        },
        {
          autorun: true,
          stalledInterval: 1000 * 60 * 30, // 30 minutes
          limiter: config?.limit, // Rate limiting config
          concurrency: config?.concurrency ?? 100,
          maxStalledCount: 100, // The maximum number of times a job can be stalled before being moved to failed
          lockDuration: 1000 * 60 * 5, // 5 minutes
          connection: this.redis.duplicate({
            db: this.env.getString('BULL_REDIS_DB'),
            maxRetriesPerRequest: null, // Required for BullMQ
          }),
        },
      );
    }

    this.logger.log(
      `Workers set up for: ${this.flows.map((w) => w.name).join(', ')}`,
    );
  }

  private async setupTriggers() {
    await this.setupEvents();

    if (this.appType === AppType.API) {
      this.run('SetupEventsWorkflow', {
        deduplication: {
          id: 'SetupEventsWorkflow',
          ttl: this.env.isProd ? 30000 : undefined, // 30 seconds
        },
      }).catch((err) => {
        this.logger.error(
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          `Failed to run setup events workflow: ${err.message}`,
        );
      });

      this.setupCronSchedules();
    }
  }

  private async setupEvents() {
    for (const flow of this.flows) {
      const config = await this.getConfig(flow);

      if (!config?.triggers) {
        continue;
      }

      for (const trigger of config.triggers) {
        if (trigger.type !== TriggerType.Event) {
          continue;
        }

        // Create a mapping of events to workflows

        const events =
          typeof trigger.event === 'string' ? [trigger.event] : trigger.event!;

        for (const event of events) {
          const fullEventName = this.getFullEventName(
            event,
            trigger.provider,
            trigger.connection,
          );

          this.emitter.on(
            fullEventName,
            (payload: any, trace?: string, baggage?: string) => {
              this.getDBEvent(flow, event, trigger.provider, trigger.connection)
                .then((dbEvent) => {
                  this.run(flow, {
                    trigger: 'EVENT',
                    triggerId: fullEventName,
                    draft: !dbEvent.active, // If the event is disabled, the workflow will not run
                    payload: payload as InputJsonValue,
                    sentry: {
                      trace,
                      baggage,
                    },
                  }).catch((e: Error) => {
                    this.logger.error(
                      `Failed to run workflow ${flow.name} for event ${fullEventName}: ${e.message}`,
                      e.stack,
                    );
                  });
                })
                .catch((e: Error) => {
                  this.logger.error(
                    `Failed to get DB event for ${fullEventName}: ${e.message}`,
                    e.stack,
                  );
                });
            },
          );
        }
      }
    }
  }

  private async extractSteps() {
    for (const flow of this.flows) {
      const instance = await this.getInstance(flow, true);
      const keys = Object.getOwnPropertyNames(Object.getPrototypeOf(instance));
      const steps: StepInfoSchema[] = [];

      for (const key of keys) {
        if (key === 'constructor') {
          continue; // Skip the constructor
        }

        const property: unknown = instance[key];

        if (typeof property !== 'function') {
          continue;
        }

        const index = this.reflector.get<number | undefined>(
          'HBH_FLOW_STEP',
          property,
        );

        if (typeof index === 'number') {
          steps.push({
            method: key,
            index,
          });
        }
      }

      flow.steps = steps.sort((a, b) => a.index - b.index);
    }
  }

  private async getInstance<
    T extends true | undefined,
    R = T extends true ? Promise<WorkflowBase> : Promise<WorkflowBase> | null,
  >(identifier: any, _throw?: T): Promise<R> {
    const flow = await this.resolveClass(identifier, _throw);

    if (!flow) {
      return null as R;
    }

    const contextId = ContextIdFactory.create();
    return (await this.moduleRef.resolve<WorkflowBase>(flow, contextId, {
      strict: false,
    })) as R;
  }

  private getFullEventName(
    event: string,
    provider?: string | null,
    connection?: string | null,
  ) {
    return `${provider ? `${provider}.` : ''}${connection ? `${connection}.` : ''}${event}`;
  }

  private async updateDBJob(
    instance: WorkflowBase,
    data: Prisma.JobUpdateInput,
  ) {
    const select = Object.keys(data).reduce((acc, key) => {
      acc[key] = true;
      return acc;
    }, {});

    const { result: result } = await this.prisma.job.update({
      where: { id: instance.dbJob.id },
      data,
      select,
      uncache: {
        uncacheKeys: [`job:${instance.dbJob.id}`],
      },
    });

    merge(instance.dbJob, result);
  }

  private async execute(instance: WorkflowBase, token?: string) {
    const flow = await this.resolveClass(instance, true);
    const { bullJob, dbJob } = instance;

    return Sentry.startSpan(
      {
        name: flow.name,
        op: 'workflow.execute',
      },
      async (span) => {
        Sentry.setContext('Workflow', {
          id: dbJob.id,
          bullId: bullJob.id,
          isRetry: bullJob.data.isRetry ?? false,
        });

        const steps = flow.steps;
        const totalSteps = steps.length;
        // Get the step to execute
        const currentStep =
          steps.find((s) => s.index === bullJob.data.stepIndex) ?? steps[0];

        for (let i = 0; i < totalSteps; i++) {
          const stepInfo = steps[i];

          if (stepInfo.index < currentStep.index) {
            // Skip steps that have already been executed
            continue;
          }

          /*await this.activityService.recordActivity({
            userId: 1, // System user ID
            action: 'OTHER',
            resource: 'JOB',
            resourceId: dbJob.id,
            subAction: 'STEP',
            details: {
              step: stepInfo.method,
            },
          });*/

          await Sentry.startSpan(
            {
              name: stepInfo.method,
              forceTransaction: true,
              op: 'workflow.step',
              parentSpan: span,
            },
            async () => {
              const isLastStep = i === steps.length - 1;
              const isFirstStep = i === 0;

              // Create or update the job step in the database
              // This will create a new job step if it doesn't exist, or update the existing one
              // to set the status to RUNNING and increment the attempts
              let { result: dbStep } = await this.prisma.jobStep.upsert({
                where: {
                  jobId_name: {
                    jobId: dbJob.id,
                    name: stepInfo.method,
                  },
                },
                create: {
                  jobId: dbJob.id,
                  name: stepInfo.method,
                  status: 'RUNNING',
                },
                update: {
                  status: 'RUNNING',
                  runs: {
                    increment: 1,
                  },
                  retries: {
                    increment: bullJob.data.isRetry ? 1 : 0,
                  },
                },
                omit: {
                  result: true,
                  resume: true,
                },
              });

              if (isFirstStep && dbStep.runs === 1) {
                // This is the first step and the first attempt
                this.emitter.emit('workflow.started', {
                  instance,
                  dbJob,
                  bullJob,
                  stepInfo,
                  dbStep,
                });
              }

              this.emitter.emit('workflow.step.started', {
                instance,
                dbJob,
                bullJob,
                stepInfo,
                dbStep,
              });

              let result: unknown;
              let error: unknown;

              try {
                result = await (
                  instance[stepInfo.method] as () => Promise<unknown>
                )();
              } catch (e: unknown) {
                if (e instanceof Error) {
                  this.logger.error(e.message, e.stack);
                  error = e;
                  result = {
                    name: e.name,
                    message: e.message,
                    cause: e.cause,
                    stack: e.stack,
                  };
                } else {
                  this.logger.error(
                    `Unknown error in step ${stepInfo.method}: ${e as any}`,
                  );
                  error = e;
                }
              }

              // @ts-expect-error private properties
              const { needsRerun, paused, delayed, cancelled } = instance;

              const maxRetriesReached =
                dbStep.retries >=
                (bullJob.opts.attempts ? bullJob.opts.attempts - 1 : 0);
              const canRetry = error && !maxRetriesReached;
              const shouldRerun = needsRerun || canRetry;

              const nextStep = shouldRerun ? steps[i] : steps[i + 1];

              if (!shouldRerun && !isLastStep) {
                await bullJob.updateData({
                  ...bullJob.data,
                  stepIndex: nextStep?.index,
                  isRetry: false,
                });
              } else if (canRetry && !bullJob.data.isRetry) {
                await bullJob.updateData({
                  ...bullJob.data,
                  isRetry: true,
                });
              }

              const jobStatus: JobStatus =
                error && !canRetry // There is an error, and we can't retry, so the job is failed
                  ? 'FAILED'
                  : paused
                    ? 'PAUSED'
                    : shouldRerun
                      ? 'WAITING_RERUN'
                      : delayed > 0
                        ? 'DELAYED'
                        : isLastStep
                          ? 'SUCCEEDED'
                          : cancelled
                            ? 'CANCELLED'
                            : 'RUNNING';

              const stepStatus: JobStepStatus = shouldRerun
                ? 'WAITING_RERUN'
                : error
                  ? 'FAILED'
                  : 'SUCCEEDED';

              if (jobStatus !== 'RUNNING') {
                // Job status is already set to RUNNING at the beginning of the method. so we only update it if it has changed
                await this.updateDBJob(instance, { status: jobStatus });

                /*await this.activityService.recordActivity({
                  userId: 1, // System user ID
                  action: 'UPDATE',
                  resource: 'JOB',
                  resourceId: dbJob.id,
                  subAction: jobStatus,
                  updated: dbJob,
                });*/
              }

              dbStep = (
                await this.prisma.jobStep.update({
                  where: {
                    jobId_name: {
                      jobId: dbJob.id,
                      name: stepInfo.method,
                    },
                  },
                  data: {
                    status: stepStatus,
                    result: result as InputJsonValue,
                  },
                  omit: {
                    result: true,
                    resume: true,
                  },
                })
              ).result;

              this.emitter.emit('workflow.step.finished', {
                instance,
                dbJob,
                bullJob,
                stepInfo,
                dbStep,
              });

              if (error instanceof Error) {
                throw error;
              } else if (delayed > 0 && nextStep) {
                // Last step can't be delayed unless it's a rerun, that's why we check for nextStep, which is undefined for the last step
                await bullJob.moveToDelayed(Date.now() + delayed, token);
                throw new DelayedError();
              }
            },
          );
        }
      },
    );
  }

  // ---------------------- Public methods ----------------------

  /**
   * Sets up the cron workflow for scheduling.
   * This method is called when the application starts to set up the cron workflow.
   * Or when a custom schedule is created.
   */
  setupCronSchedules() {
    this.run('SetupCronWorkflow', {
      deduplication: {
        id: 'SetupCronWorkflow',
        ttl: this.env.isProd ? 30000 : undefined, // 30 seconds
      },
      scheduledAt: this.env.isProd ? new Date(Date.now() + 5000) : undefined, // 5 seconds from now
    }).catch((err) => {
      this.logger.error(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        `Failed to run setup cron workflow: ${err.message}`,
      );
    });
  }

  /**
   * Resumes a paused job in the workflow.
   *
   * @param jobId - The ID of the job to resume.
   * @param data - Optional data to pass to the step when resuming.
   * @param userId - The ID of the user requesting the resume, defaults to 1 (system user).
   * @param req - The express request object, if available.
   */
  async resume(
    jobId: number,
    data?: InputJsonValue,
    userId = 1,
    req?: express.Request,
  ) {
    try {
      const { bullJob, queue, job } = await this.getJob(jobId);

      if (job.status !== 'PAUSED') {
        throw new Error(`Job with ID ${jobId} is not paused.`);
      }

      if (
        ['number', 'bigint', 'boolean'].includes(typeof data) ||
        !isEmpty(data)
      ) {
        const { result: step } = await this.prisma.jobStep.findFirst({
          where: { jobId },
          orderBy: { createdAt: 'desc' },
          select: {
            name: true, // Get the name of the last step
          },
        });

        // If the step exists, update its resume data

        if (step) {
          await this.prisma.jobStep.update({
            where: {
              jobId_name: {
                jobId,
                name: step.name,
              },
            },
            data: { resume: data },
            select: {
              name: true,
            },
          });
        }
      }

      if (await bullJob.isDelayed()) {
        await bullJob.changeDelay(0);
      }

      const dbFlow = await this.getDBFlow(job.workflowId);

      if (dbFlow.active && (await queue.isPaused())) {
        await queue.resume();
      }

      await this.activityService.recordActivity({
        req,
        userId,
        action: 'OTHER',
        resource: 'JOB',
        resourceId: job.id,
        subAction: 'RESUME',
      });

      return {
        bullJob,
        job,
      };
    } catch (e: unknown) {
      if (e instanceof Error) {
        this.logger.error(e.message, e.stack);
      }
    }
  }

  /**
   * Cancels a paused or delayed job in the workflow.
   *
   * @param jobId - The ID of the job to cancel.
   * @param userId - The ID of the user requesting the cancellation, defaults to 1 (system user).
   * @param req - The express request object, if available.
   */
  async cancel(jobId: number, userId = 1, req?: express.Request) {
    const { bullJob, queue, job } = await this.getJob(jobId);

    if (
      job.status !== 'PAUSED' &&
      job.status !== 'DELAYED' &&
      job.status !== 'WAITING_RERUN'
    ) {
      throw new Error(`Job with ID ${jobId} is not paused or delayed.`);
    }

    // Remove the job from the queue
    await bullJob.remove();

    // Update the job status in the database
    const updated = await this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'CANCELLED',
        bullId: null, // Clear the Bull ID since the job is canceled
      },
      omit: {
        payload: true,
        sentryBaggage: true,
        sentryTrace: true,
      },
      uncache: {
        uncacheKeys: [`job:${jobId}`],
      },
    });

    await this.activityService.recordActivity({
      userId,
      req,
      action: 'UPDATE',
      resource: 'JOB',
      resourceId: jobId,
      subAction: 'CANCEL',
      data: job,
      updated,
    });

    const dbFlow = await this.getDBFlow(job.workflowId);

    if (dbFlow.active && (await queue.isPaused())) {
      await queue.resume();
    }

    return {
      bullJob,
      job: updated,
    };
  }

  /**
   * Executes a draft job by its ID.
   * @param jobId - The ID of the job to execute.
   * @param userId - The ID of the user executing the job, defaults to 1 (system user).
   * @param req - The express request object, if available.
   * @returns A promise that resolves to the Bull job and the corresponding database job.
   */
  async executeDraft(jobId: number, userId = 1, req?: express.Request) {
    const { result: job } = await this.prisma.job.findUnique({
      where: {
        id: jobId,
        status: 'DRAFT',
      },
      select: {
        id: true,
        workflowId: true,
        status: true,
        options: true, // Options may contain context, scheduledAt, etc.
      },
    });

    if (!job) {
      throw new Error(`Job with ID ${jobId} not found or is not a draft.`);
    }

    if (job.status !== 'DRAFT') {
      throw new Error(`Job with ID ${jobId} is not a draft.`);
    }

    const flow = await this.resolveClass(job.workflowId, true);
    const config = await this.getConfig(flow, true);
    const options = job.options as Jsonify<RunOptions>;

    const id = `#${job.id}`;

    const bullJob = await flow.queue.add(
      flow.name,
      {
        dbJobId: job.id,
        context: options?.context as unknown,
      },
      {
        delay: options?.scheduledAt
          ? new Date(options.scheduledAt).getTime() - Date.now()
          : 0,
        attempts: (options?.maxRetries ?? config.maxRetries ?? 0) + 1, // +1 because the first attempt is not counted as a retry
        jobId: id,
        deduplication: options?.deduplication,
      },
    );

    await this.activityService.recordActivity({
      req,
      userId: userId,
      action: 'OTHER',
      resource: 'JOB',
      resourceId: job.id,
      subAction: 'EXECUTE_DRAFT',
    });

    return {
      bullJob,
      job,
    };
  }

  /**
   * Runs a workflow with the provided options.
   *
   * @param identifier - The workflow to run.
   * Can be a workflow name or an instance of WorkflowBase or a class extending it.
   * @param options - Options for running the workflow, such as payload, context, and scheduling.
   * @returns A promise that resolves to the created Bull job and the corresponding database job.
   */
  async run(
    identifier: any,
    options?: RunOptions,
  ): Promise<{
    bullJob: BullJob | null;
    job: DBJobSlim;
  }> {
    const dbFlow = await this.getDBFlow(identifier);
    const flow = await this.resolveClass(identifier, true);
    const config = await this.getConfig(flow, true);
    const queue = flow.queue;

    if (!queue) {
      throw new Error(`Queue not found for workflow: ${flow.name}`);
    }

    let dbJob: DBJobSlim | null = null;

    if (options?.deduplication?.id) {
      dbJob = (
        await this.prisma.job.findFirst({
          where: {
            workflowId: dbFlow.id,
            dedupeId: options.deduplication.id,
            status: {
              in: [
                'DELAYED',
                'PAUSED',
                'RUNNING',
                'STALLED',
                'WAITING',
                'WAITING_RERUN',
              ],
            },
          },
          omit: {
            payload: true,
            sentryBaggage: true,
            sentryTrace: true,
            responseMeta: true,
          },
        })
      ).result;
    }

    if (!dbJob) {
      dbJob = (
        await this.prisma.job.create({
          data: {
            workflowId: dbFlow.id,
            parentId: options?.parentId,
            status: options?.draft ? 'DRAFT' : 'WAITING',
            trigger: options?.trigger ?? 'MANUAL',
            triggerId: options?.triggerId ?? null,
            payload: options?.payload as InputJsonValue,
            options: !options?.draft ? undefined : (options as InputJsonValue),
            sentryBaggage: options?.sentry?.baggage,
            sentryTrace: options?.sentry?.trace,
            dedupeId: options?.deduplication?.id,
          },
          omit: {
            payload: true,
            sentryBaggage: true,
            sentryTrace: true,
            responseMeta: true,
          },
        })
      ).result;

      /*await this.activityService.recordActivity({
        userId: options?.userId ?? 1, // Fallback to the system user
        action: 'CREATE',
        resource: 'JOB',
        resourceId: dbJob.id,
        subAction: 'RUN',
        updated: dbJob,
      });*/

      if (options?.userId) {
        await this.activityService.recordActivity({
          userId: options?.userId, // Fallback to the system user
          action: 'CREATE',
          resource: 'JOB',
          resourceId: dbJob.id,
          subAction: 'RUN',
          updated: dbJob,
        });
      }
    }

    if (options?.draft) {
      return {
        bullJob: null,
        job: dbJob,
      };
    }

    if (options?.beforeQueue) {
      await options.beforeQueue(dbJob);
    }

    const id = `#${dbJob.id}`;

    const bullJob = await queue.add(
      flow.name,
      {
        dbJobId: dbJob.id,
        requesterRuntimeId: this.runtimeId,
        needResponse: options?.needResponse,
        context: options?.context as unknown,
      },
      {
        delay: options?.scheduledAt
          ? options.scheduledAt.getTime() - Date.now()
          : 0,
        attempts: (options?.maxRetries ?? config.maxRetries ?? 0) + 1, // +1 because the first attempt is not counted as a retry
        jobId: id,
        deduplication: options?.deduplication,
      },
    );

    return {
      bullJob,
      job: dbJob,
    };
  }

  /**
   * Repeats a workflow with the provided options.
   *
   * @param identifier - The workflow to repeat.
   * Can be a workflow name or an instance of WorkflowBase or a class extending it.
   * @param options - Options for repeating the workflow, such as cron pattern, timezone, and immediate execution.
   * @returns A promise that resolves to the created Bull job and the corresponding schedule.
   */
  async repeat(identifier: any, options: RepeatOptions) {
    const dbFlow = await this.getDBFlow(identifier);
    const flow = await this.resolveClass(identifier, true);
    const queue = flow.queue;

    if (!queue) {
      throw new Error(`Queue not found for workflow: ${flow.name}`);
    }

    let schedule: Prisma.ScheduleGetPayload<object>;

    try {
      schedule = (
        await this.prisma.schedule.upsert({
          where: {
            workflowId_cronExpression: {
              workflowId: dbFlow.id,
              cronExpression: options.oldPattern ?? options.pattern,
            },
          },
          create: {
            workflowId: dbFlow.id,
            cronExpression: options.pattern,
          },
          update: {
            workflowId: dbFlow.id,
            cronExpression: options.pattern,
            dangling: false,
          },
        })
      ).result;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e: any) {
      // After the first upsert in the try block, the oldPattern no longer exists
      // in that case, Prisma will throw an error
      // we need to set dangling to false
      schedule = (
        await this.prisma.schedule.upsert({
          where: {
            workflowId_cronExpression: {
              workflowId: dbFlow.id,
              cronExpression: options.pattern,
            },
          },
          create: {
            workflowId: dbFlow.id,
            cronExpression: options.pattern,
          },
          update: {
            workflowId: dbFlow.id,
            cronExpression: options.pattern,
            dangling: false,
          },
        })
      ).result;
    }

    /*await this.activityService.recordActivity({
      userId: 1, // System user ID
      action: 'OTHER',
      resource: 'SCHEDULE',
      resourceId: schedule.id,
      subAction: 'UPSERT',
      updated: schedule,
    });*/

    if (!schedule.active) {
      // The schedule is not active, so we remove it from the queue if it exists
      await queue.removeJobScheduler(`#${schedule.id}`);

      return {
        bullJob: null,
        schedule,
      };
    }

    const bullJob = await queue.upsertJobScheduler(
      `#${schedule.id}`,
      {
        pattern: options.pattern,
        tz: options.timezone,
        immediately: options.immediate,
      },
      {
        name: flow.name,
        data: {
          scheduleId: schedule.id,
          context: options?.context as unknown,
        },
        opts: {
          attempts: options?.maxRetries,
          repeatJobKey: `#${schedule.id}`,
        },
      },
    );

    return {
      bullJob,
      schedule,
    };
  }

  /**
   * Retrieves a job by its ID.
   *
   * @param jobId - The ID of the job to retrieve.
   * @returns A promise that resolves to the job details, including the Bull job and queue.
   */
  async getJob(jobId: number) {
    const { result: job } = await this.prisma.job.findUnique({
      where: { id: jobId },
      omit: {
        payload: true,
        sentryBaggage: true,
        sentryTrace: true,
        responseMeta: true,
      },
      cache: {
        key: `job:${jobId}`,
        ttl: /* 5 minute */ 1000 * 60 * 5,
      },
    });

    if (!job) {
      throw new Error(`Job with ID ${jobId} not found`);
    }

    const queue = await this.getQueue(job.workflowId);
    const bullJob = job.bullId ? await queue.getJob(job.bullId) : null;

    if (!bullJob) {
      throw new Error(`Bull job with ID #${job.bullId} not found`);
    }

    return {
      job,
      bullJob,
      queue,
    };
  }

  /**
   * Retrieves the result of a specific step in a job.
   *
   * @param jobId - The ID of the job to retrieve the result from.
   * @param step - The name of the step whose result is to be retrieved.
   * @returns A promise that resolves to the result of the step, or null if not found.
   */
  async getResult<R = any>(jobId: number, step: string): Promise<R | null> {
    const { result: row } = await this.prisma.jobStep.findFirst({
      where: {
        jobId,
        name: step,
      },
      select: {
        result: true,
      },
    });

    return (row?.result ?? null) as R;
  }

  /**
   * Retrieves the results of all steps in a job.
   *
   * @param jobId - The ID of the job to retrieve the results from.
   * @returns A promise that resolves to an object containing the results of all steps, keyed by step name.
   */
  async getResults<R = any>(jobId: number): Promise<{ [step: string]: R }> {
    const { result: rows } = await this.prisma.jobStep.findMany({
      where: {
        jobId,
      },
      select: {
        name: true,
        result: true,
      },
      distinct: ['name'],
    });

    const results: { [step: string]: R } = {};

    for (const row of rows) {
      results[row.name] = row.result as R;
    }

    return results;
  }

  /**
   * Retrieves the resume data of a specific step in a job.
   *
   * @param jobId - The ID of the job to retrieve the resume data from.
   * @param step - The name of the step whose resume data is to be retrieved.
   * @returns A promise that resolves to the resume data of the step, or null if
   */
  async getResumeData(
    jobId: number,
    step: string,
  ): Promise<InputJsonValue | null> {
    const { result: row } = await this.prisma.jobStep.findFirst({
      where: {
        jobId,
        name: step,
      },
      select: {
        resume: true,
      },
    });

    return (row?.resume ?? null) as InputJsonValue;
  }

  /**
   * Generates a JWT token for a job.
   *
   * @param jobId - The ID of the job to generate the token for.
   * @param expiresIn - Optional expiration time for the token.
   * @returns A promise that resolves to the generated JWT token.
   */
  async getJobToken(
    jobId: number,
    expiresIn?: string | number,
  ): Promise<string> {
    return this.jwtService.signAsync(
      {
        jid: jobId,
      },
      {
        expiresIn: expiresIn ?? '1y', // Default to 1 year
        subject: 'job',
        issuer: 'job',
        audience: 'job',
      },
    );
  }

  /**
   * Verifies a JWT token for a job.
   *
   * @param token - The JWT token to verify.
   * @returns A promise that resolves to the decoded token payload.
   */
  async verifyJobToken(token: string): Promise<{ jid: number }> {
    return await this.jwtService.verifyAsync<{ jid: number }>(token, {
      subject: 'job',
      issuer: 'job',
      audience: 'job',
    });
  }

  /**
   * Waits for a job to finish processing.
   *
   * @param jobId - The ID of the job to wait for.
   * @param ttl - The time-to-live in milliseconds to wait for the job to finish.
   * @returns A promise that resolves when the job is completed.
   */
  async waitForJob(jobId: number, ttl?: number) {
    const { bullJob, job } = await this.getJob(jobId);

    if (await bullJob.isCompleted()) {
      return;
    }

    const dbFlow = await this.getDBFlow(job.workflowId);
    const flow = await this.resolveClass(dbFlow.key, true);

    await bullJob.waitUntilFinished(flow.queueEvents, ttl);
  }

  /**
   * Retrieves the config for a specific workflow.
   *
   * @param identifier - The workflow class to get config for.
   * @param _throw - Whether to throw an error if the workflow is not found.
   * @returns The config for the workflow, or null if not found.
   */
  async getConfig<
    T extends true | undefined,
    R = T extends true ? WorkflowConfigSchema : WorkflowConfigSchema | null,
  >(identifier: any, _throw?: T): Promise<R> {
    const flow = await this.resolveClass(identifier, _throw);

    if (!flow) {
      return null as R;
    }

    return this.reflector.get<R>('HBH_FLOW', flow);
  }

  /**
   * Retrieves the queue for a specific workflow.
   *
   * @param identifier - The workflow to get the queue for.
   */
  async getQueue(identifier: any) {
    return (await this.resolveClass(identifier, true)).queue;
  }

  /**
   * Resolves a workflow class based on the provided identifier.
   *
   * @param identifier - The identifier for the workflow.
   * Can be a workflow name, an instance of WorkflowBase, or a class extending it.
   * @param _throw - Whether to throw an error if the workflow is not found.
   * @returns The resolved workflow class or null if not found.
   */
  async resolveClass<
    T extends true | undefined,
    R = T extends true ? typeof WorkflowBase : typeof WorkflowBase | null,
  >(identifier: any, _throw?: T): Promise<R> {
    let flow: typeof WorkflowBase | null = null;

    if (typeof identifier === 'number') {
      const dbFlow = await this.getDBFlow(identifier);

      if (!dbFlow) {
        flow = null;
      } else {
        flow = this.flowsByKey.get(dbFlow.key) ?? null;
      }
    } else if (typeof identifier === 'string') {
      flow = this.flowsByKey.get(identifier) ?? null;

      if (!flow) {
        flow = this.discoveryService
          .getProviders()
          .find(
            (provider) =>
              provider.metatype &&
              provider.metatype.name === identifier &&
              this.reflector.get<WorkflowConfigSchema | null>(
                'HBH_FLOW',
                provider.metatype,
              ),
          )?.metatype as typeof WorkflowBase;
      }
    } else if (identifier instanceof WorkflowBase) {
      flow = identifier.constructor as typeof WorkflowBase;
    } else if (this.flowsSet.has(identifier as typeof WorkflowBase)) {
      flow = identifier as typeof WorkflowBase;
    }

    if (!flow && _throw) {
      const name = (
        typeof identifier === 'string'
          ? identifier
          : typeof identifier === 'function'
            ? (identifier as typeof WorkflowBase).name
            : identifier
      ) as string;

      throw new WorkflowNotFoundException(
        `Workflow ${name} not found in the DI container`,
      );
    }

    return flow as R;
  }

  /**
   * Retrieves the database workflow for a given workflow.
   *
   * @param identifier - The identifier for the workflow
   * Can be a workflow name, an instance of WorkflowBase, or a class extending it.
   * @returns A promise that resolves to the DBWorkflow object.
   */
  async getDBFlow(identifier: any) {
    if (typeof identifier === 'number') {
      // Careful not to use `this.resolveClass` anywhere outside this scope in this method
      // because you may end up with an infinite loop
      const dbFlow = (
        await this.prisma.workflow.findUnique({
          where: { id: identifier },
          cache: {
            key: `workflow:id:${identifier}`,
          },
        })
      ).result;

      if (!dbFlow) {
        throw new WorkflowNotFoundException(
          `Workflow with ID ${identifier} not found in the database`,
        );
      }

      return dbFlow;
    }

    const flow = await this.resolveClass(identifier, true);
    const config = await this.getConfig(flow);
    const key = config?.key ?? flow.name;

    try {
      const { result: dbFlow } = await this.prisma.workflow.findUniqueOrThrow({
        where: { key },
        cache: {
          key: `workflow:key:${key}`,
        },
      });

      return dbFlow;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      const { result: dbFlow } = await this.prisma.workflow.upsert({
        where: { key },
        create: { key, folderId: config?.internal ? 1 : null },
        update: { key },
        uncache: {
          uncacheKeys: [`workflow:key:${key}`],
        },
      });

      /*await this.activityService.recordActivity({
        userId: 1, // System user ID
        action: 'OTHER',
        resource: 'WORKFLOW',
        resourceId: dbFlow.id,
        subAction: 'UPSERT',
        updated: dbFlow,
      });*/

      return dbFlow;
    }
  }

  /**
   * Retrieves or creates a database event for a workflow.
   *
   * @param identifier - The identifier for the workflow
   * Can be a workflow name, an instance of WorkflowBase, or a class extending it.
   * @param name - The name of the event to retrieve or create.
   * @param provider - Optional provider for the event.
   * @param connection - Optional connection for the event.
   * @returns A promise that resolves to the event result.
   */
  async getDBEvent(
    identifier: any,
    name: string,
    provider?: string,
    connection?: string,
  ) {
    const dbFlow = await this.getDBFlow(identifier);

    const dbEvent = await this.prisma.event.findFirst({
      where: {
        workflowId: dbFlow.id,
        connection,
        provider,
        name,
      },
      cache: {
        key: `event:${dbFlow.id}:${provider ?? ''}:${connection ?? ''}:${name}`,
      },
    });

    if (dbEvent.result) {
      return dbEvent.result;
    }

    const { result } = await this.prisma.event.upsert({
      where: {
        id: 0,
      },
      update: {
        workflowId: dbFlow.id,
        name,
        provider,
        connection,
      },
      create: {
        workflowId: dbFlow.id,
        name,
        provider,
        connection,
      },
      uncache: {
        uncacheKeys: [
          `event:${dbFlow.id}:${provider ?? ''}:${connection ?? ''}:${name}`,
        ],
      },
    });

    /*await this.activityService.recordActivity({
      userId: 1, // System user ID
      action: 'OTHER',
      resource: 'EVENT',
      resourceId: result.id,
      subAction: 'UPSERT',
      updated: result,
    });*/

    return result;
  }
}
