import { APP_TYPE, GlobalEventService, PrismaService } from '#lib/core/misc';
import { StepInfoSchema } from '#lib/workflow/schema/step-info.schema';
import { WorkflowOptions } from '#lib/workflow/types/workflow-options';
import type { InputJsonValue } from '@prisma/client/runtime/client';
import { TriggerType } from '#lib/workflow/misc/trigger-type.enum';
import { RepeatOptions } from '#lib/workflow/types/repeat-options';
import { DelayedError, Queue, QueueEvents, Worker } from 'bullmq';
import { WorkflowBase } from '#lib/workflow/misc/workflow-base';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { RunOptions } from '#lib/workflow/types/run-options';
import { JobPayload } from '#lib/workflow/types/job-payload';
import { REDIS_PUB } from '#lib/core/redis';
import { EnvService } from '#lib/core/env';
import { AppType } from '#lib/core/types';
import { JwtService } from '@nestjs/jwt';
import type { Jsonify } from 'type-fest';
import { Redis } from 'ioredis';
import _ from 'lodash';

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
  Workflow as DBWorkflow,
  JobStepStatus,
  Job as DBJob,
  JobStatus,
  Prisma,
} from '@prisma/client';

import {
  NoWebhookTriggerException,
  WorkflowNotFoundException,
} from './exceptions';

@Injectable()
export class WorkflowService implements OnApplicationBootstrap {
  constructor(
    private readonly discoveryService: DiscoveryService,
    @Inject(APP_TYPE) private readonly appType: AppType,
    @Inject(REDIS_PUB) private readonly redis: Redis,
    private globalEvent: GlobalEventService,
    private readonly jwtService: JwtService,
    private readonly emitter: EventEmitter2,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
    private readonly moduleRef: ModuleRef,
    private readonly env: EnvService,
  ) {}

  private readonly logger = new Logger(WorkflowService.name);

  private readonly eventMap = new Map<string, Set<typeof WorkflowBase>>();
  public readonly flowsByKey = new Map<string, typeof WorkflowBase>();
  public readonly dbFlowsByKey = new Map<string, DBWorkflow>();
  public readonly dbFlowsById = new Map<number, DBWorkflow>();
  private readonly flowsSet = new Set<typeof WorkflowBase>();
  public readonly flows: (typeof WorkflowBase)[] = [];

  // ---------------------- Internal methods ----------------------

  /**
   * Sets up the workflows, queues, and workers when the application starts.
   *
   * @internal
   */
  onApplicationBootstrap() {
    // Queues must be set up in both Worker and API, so both can enqueue jobs
    // but only the Worker must process them.

    // getOptions and resolveClass functions can't be used in this method
    const flows = this.discoveryService
      .getProviders()
      .filter(
        (provider) =>
          provider.metatype &&
          this.reflector.get<WorkflowOptions | null>(
            'HBH_FLOW',
            provider.metatype,
          ),
      )
      .map((provider) => provider.metatype as typeof WorkflowBase);

    for (const flow of flows) {
      const options = this.reflector.get<WorkflowOptions | null>(
        'HBH_FLOW',
        flow,
      );

      this.flowsSet.add(flow);
      this.flows.push(flow);
      this.flowsByKey.set(options!.key ?? flow.name, flow);
    }

    this.extractSteps()
      .then(() => {
        this.setupQueues();
        this.setupTriggers();

        if (this.appType === AppType.Worker) {
          this.setupWorkers();
        }
      })
      .catch((e) => {
        throw e;
      });
  }

  @OnEvent('global.workflow.update')
  private onWorkflowUpdate(data: Jsonify<DBWorkflow>) {
    const deserialized: DBWorkflow = {
      ...data,
      createdAt: new Date(data.createdAt),
      updatedAt: data.updatedAt ? new Date(data.updatedAt) : null,
    };

    this.dbFlowsByKey.set(deserialized.key, deserialized);
    this.dbFlowsById.set(deserialized.id, deserialized);
  }

  private setupQueues() {
    const usedKeys = new Set<string>();

    for (const flow of this.flows) {
      const options = this.getOptions(flow);
      const key = options?.key ?? flow.name;

      if (usedKeys.has(key)) {
        throw new Error(`Duplicate workflow key detected: ${key}`);
      }

      usedKeys.add(key);

      // Assign the queue to the workflow for later use
      flow.queue = new Queue<JobPayload>(key, {
        defaultJobOptions: {
          // Remove jobs from the queue after completion or failure to reduce memory usage
          removeOnComplete: {
            count: options?.internal ? 1 : 100, // Keep the last 100 completed jobs
            age: 1000 * 60 * 60 * 24, // Keep jobs for 24 hours
          },
          removeOnFail: {
            count: options?.internal ? 5 : 200, // Keep the last 200 failed jobs
            age: 1000 * 60 * 60 * 48, // Keep jobs for 48 hours
          },
          attempts: 1, // Number of retry attempts for failed jobs
        },
        streams: {
          events: {
            maxLen: options?.internal ? 50 : 1000, // Maximum number of events to keep in the stream, use low value to reduce memory usage
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

        const dbFlow = this.dbFlowsByKey.get(key);

        if (!dbFlow?.active) {
          this.logger.warn(
            `Workflow ${flow.name} is not active, pausing the queue.`,
          );

          flow.queue.pause().catch(() => {
            // Ignore errors, the queue might already be paused
          });
        }
      });
    }

    this.logger.log(
      `Queues set up for: ${this.flows.map((w) => w.name).join(', ')}`,
    );
  }

  private setupWorkers() {
    for (const flow of this.flows) {
      const queue = flow.queue;
      const options = this.getOptions(flow);

      // Assign the worker to the workflow for later use
      flow.worker = new Worker<JobPayload>(
        queue.name,
        async (job, token) => {
          const instance = await this.getInstance(flow, true);

          if (!instance) {
            throw new Error(`Workflow instance not found for: ${flow.name}`);
          }

          const dbFlow = await this.getDBFlow(flow);

          let dbJob: DBJob;

          if (job.data.dbJobId) {
            // Doing upsert, in case the job was deleted from the database
            dbJob = await this.prisma.job.upsert({
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
            });
          } else if (job.data.scheduleId) {
            const schedule = await this.prisma.schedule.findUniqueOrThrow({
              where: { id: job.data.scheduleId },
            });

            dbJob = await this.prisma.job.upsert({
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
            });
          } else {
            return this.logger.warn(
              `Job ${job.id} does not have a dbJobId or scheduleId, skipping execution.`,
            );
          }

          instance.bullJob = job;
          instance.dbJob = dbJob;
          instance.queue = queue;
          instance.worker = flow.worker;

          return this.execute(instance, options?.maxRetries ?? 3, token);
        },
        {
          autorun: true,
          stalledInterval: 1000 * 60 * 30, // 30 minutes
          limiter: options?.limit, // Rate limiting options
          concurrency: options?.concurrency ?? 100,
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

  private setupTriggers() {
    for (const flow of this.flows) {
      const options = this.getOptions(flow);

      if (!options?.triggers) {
        continue;
      }

      for (const trigger of options.triggers) {
        if (trigger.type !== TriggerType.Event) {
          continue;
        }

        // Create a mapping of events to workflows

        const events =
          typeof trigger.event === 'string' ? [trigger.event] : trigger.event!;
        const source = trigger.eventSource ? `${trigger.eventSource}.` : '';

        for (const item of events) {
          const event = `flow.${source}${item}`;

          if (!this.eventMap.has(event)) {
            this.eventMap.set(event, new Set());
          }

          // Add the workflow to the event map
          this.eventMap.get(event)!.add(flow);
        }
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const instance = this;

    this.emitter.on(
      'flow.**',
      function (
        this: Record<string, any>,
        payload: any,
        trace?: string,
        baggage?: string,
      ) {
        const event = this.event as string;

        const flows = instance.eventMap.get(event);

        if (!flows) {
          instance.logger.warn(`No workflows found for event: ${event}`);
          return; // No workflows for this event
        }

        for (const flow of flows) {
          instance
            .getDBFlow(flow)
            .then((df) => {
              instance
                .run(flow, {
                  trigger: 'EVENT',
                  triggerId: event,
                  draft: df.disabledEvents.includes(event), // If the event is disabled, the workflow will not run
                  payload: payload as InputJsonValue,
                  sentry: {
                    trace,
                    baggage,
                  },
                })
                .catch((e: Error) => {
                  instance.logger.error(
                    `Failed to run workflow ${flow.name} for event ${event}: ${e.message}`,
                  );
                });
            })
            .catch((e: Error) => {
              instance.logger.error(
                `Failed to get DB workflow for ${flow.name}: ${e.message}`,
              );
            });
        }
      },
    );

    if (this.appType === AppType.API) {
      // Run SetupCronWorkflow, which is an internal workflow and is used to set up cron jobs

      this.run('SetupCronWorkflow', {
        deduplication: {
          id: 'SetupCronWorkflow',
          ttl: this.env.isProd ? 30000 : undefined, // 30 seconds
        },
        scheduledAt: this.env.isProd ? new Date(Date.now() + 5000) : undefined, // 5 seconds from now
      }).catch((err) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        this.logger.error(`Failed to run setup cron workflow: ${err.message}`);
      });
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

  private getInstance<
    T extends true | undefined,
    R = T extends true ? Promise<WorkflowBase> : Promise<WorkflowBase> | null,
  >(identifier: any, _throw?: T): R {
    const flow = this.resolveClass(identifier, _throw);

    if (!flow) {
      return null as R;
    }

    const contextId = ContextIdFactory.create();
    return this.moduleRef.resolve<WorkflowBase>(flow, contextId, {
      strict: false,
    }) as R;
  }

  private async updateDBJob(
    instance: WorkflowBase,
    data: Prisma.JobUpdateInput,
  ) {
    const select = Object.keys(data).reduce((acc, key) => {
      acc[key] = true;
      return acc;
    }, {});

    const result = await this.prisma.job.update({
      where: { id: instance.dbJob.id },
      data,
      select,
    });

    _.merge(instance.dbJob, result);
  }

  private async execute(
    instance: WorkflowBase,
    maxRetries: number,
    token?: string,
  ) {
    const flow = this.resolveClass(instance, true);
    const { bullJob, dbJob } = instance;

    const steps = flow.steps;
    // Get the step to execute
    const currentStep =
      steps.find((s) => s.index === bullJob.data.stepIndex) ?? steps[0];

    for (const stepInfo of steps) {
      const i = steps.indexOf(stepInfo);
      const isLastStep = i === steps.length - 1;
      const isFirstStep = i === 0;

      // Create or update the job step in the database
      // This will create a new job step if it doesn't exist, or update the existing one
      // to set the status to RUNNING and increment the attempts
      let dbStep = await this.prisma.jobStep.upsert({
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
        },
        omit: {
          result: true,
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
        result = await (instance[stepInfo.method] as () => Promise<unknown>)();
      } catch (e: unknown) {
        if (e instanceof Error) {
          this.logger.error(e.message, e.stack);
          error = {
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

      const maxRetriesReached = dbStep.retries <= maxRetries;
      const canRetry = error && !maxRetriesReached;
      const shouldRerun = needsRerun || canRetry;

      const nextStep = shouldRerun ? steps[i] : steps[i + 1];

      if (nextStep !== currentStep) {
        await bullJob.updateData({
          ...bullJob.data,
          stepIndex: nextStep?.index,
        });
      }

      const jobStatus: JobStatus =
        error && !canRetry
          ? 'FAILED'
          : paused
            ? 'PAUSED'
            : needsRerun
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
      }

      dbStep = await this.prisma.jobStep.update({
        where: {
          jobId_name: {
            jobId: dbJob.id,
            name: stepInfo.method,
          },
        },
        data: {
          status: stepStatus,
          result: (error ?? result) as InputJsonValue,
        },
        omit: {
          result: true,
        },
      });

      this.emitter.emit('workflow.step.finished', {
        instance,
        dbJob,
        bullJob,
        stepInfo,
        dbStep,
      });

      if (delayed > 0 && nextStep) {
        // Last step can't be delayed unless it's a rerun, that's why we check for nextStep, which is undefined for the last step
        await bullJob.moveToDelayed(delayed, token);
        throw new DelayedError();
      }
    }
  }

  // ---------------------- Public methods ----------------------

  /**
   * Resumes a paused job in the workflow.
   * Can be a workflow name or an instance of WorkflowBase or a class extending it.
   *
   * @param jobId - The ID of the job to resume.
   */
  async resume(jobId: number) {
    try {
      const { bullJob, queue, job } = await this.getJob(jobId);

      if (await bullJob.isDelayed()) {
        await bullJob.changeDelay(0);
      }

      await bullJob.promote();

      const dbFlow = await this.getDBFlow(job.workflowId);

      if (!dbFlow.active) {
        return;
      }

      if (await queue.isPaused()) {
        await queue.resume();
      }
    } catch (e: unknown) {
      if (e instanceof Error) {
        this.logger.error(e.message, e.stack);
      }
    }
  }

  /**
   * Runs a workflow with the provided options.
   *
   * @param identifier - The workflow to run.
   * Can be a workflow name or an instance of WorkflowBase or a class extending it.
   * @param options - Options for running the workflow, such as payload, context, and scheduling.
   * @returns A promise that resolves to the created Bull job and the corresponding database job.
   */
  async run(identifier: any, options?: RunOptions) {
    const dbFlow = await this.getDBFlow(identifier);
    const flow = this.resolveClass(identifier, true);
    const queue = flow.queue;

    if (!queue) {
      throw new Error(`Queue not found for workflow: ${flow.name}`);
    }

    let dbJob: DBJob | null = null;

    if (options?.deduplication?.id) {
      dbJob = await this.prisma.job.findFirst({
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
      });
    }

    if (!dbJob) {
      dbJob = await this.prisma.job.create({
        data: {
          workflowId: dbFlow.id,
          status: options?.draft ? 'DRAFT' : 'WAITING',
          trigger: options?.trigger ?? 'MANUAL',
          triggerId: options?.triggerId ?? null,
          payload: options?.payload as InputJsonValue,
          sentryBaggage: options?.sentry?.baggage,
          sentryTrace: options?.sentry?.trace,
          dedupeId: options?.deduplication?.id,
        },
      });
    }

    if (options?.draft) {
      return {
        bullJob: null,
        dbJob: dbJob,
      };
    }

    const id = `#${dbJob.id}`;

    const bullJob = await queue.add(
      flow.name,
      {
        dbJobId: dbJob.id,
        context: options?.context as unknown,
      },
      {
        delay: options?.scheduledAt
          ? options.scheduledAt.getTime() - Date.now()
          : 0,
        attempts: options?.maxRetries,
        jobId: id,
        deduplication: options?.deduplication,
      },
    );

    return {
      bullJob,
      dbJob,
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
    const flow = this.resolveClass(identifier, true);
    const queue = flow.queue;

    if (!queue) {
      throw new Error(`Queue not found for workflow: ${flow.name}`);
    }

    let schedule: Prisma.ScheduleGetPayload<object>;

    try {
      schedule = await this.prisma.schedule.upsert({
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
      });
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e: any) {
      // After the first upsert in the try block, the oldPattern no longer exists
      // in that case, Prisma will throw an error
      // we need to set dangling to false
      schedule = await this.prisma.schedule.upsert({
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
      });
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
   * Generates a JWT token for triggering a workflow via webhook.
   *
   * @param identifier - The workflow to generate the token for.
   * Can be a workflow name or an instance of WorkflowBase or a class extending it.
   * @param key - The key to use for the token in case of multiple webhooks.
   * @param expiresIn - The expiration time for the token, in seconds or a string like '1h'.
   * @returns A promise that resolves to the generated JWT token.
   */
  async getToken(identifier: any, key: string, expiresIn: number | string) {
    const flow = this.resolveClass(identifier, true);
    const options = this.getOptions(flow);

    if (
      !options?.triggers?.find(
        (trigger) => trigger.type === TriggerType.Webhook,
      )
    ) {
      throw new NoWebhookTriggerException();
    }

    return this.jwtService.signAsync(
      { wflow: flow.name, wid: key },
      {
        subject: 'access',
        audience: 'workflow',
        issuer: 'webhook',
        expiresIn,
      },
    );
  }

  /**
   * Handles a webhook request by verifying the JWT token and running the corresponding workflow.
   *
   * @param token - The JWT token from the webhook request.
   * @param payload - Optional payload to pass to the workflow.
   * @returns A promise that resolves to the result of the workflow execution.
   */
  async handleWebhook(token: string, payload?: unknown) {
    const jwt = await this.jwtService.verifyAsync<{
      wflow: string;
      wid: string;
    }>(token, {
      subject: 'access',
      audience: 'workflow',
      issuer: 'webhook',
    });

    const flow = this.flowsByKey.get(jwt.wflow);

    if (!flow) {
      throw new WorkflowNotFoundException();
    }

    const dbFlow = await this.getDBFlow(flow);
    const options = this.getOptions(flow);

    if (
      !options?.triggers?.find(
        (trigger) => trigger.type === TriggerType.Webhook,
      )
    ) {
      throw new NoWebhookTriggerException();
    }

    return this.run(flow, {
      draft: dbFlow.disabledWebhooks.includes(jwt.wid),
      trigger: 'WEBHOOK',
      triggerId: jwt.wid,
      payload,
      // TODO: Add Sentry context
    });
  }

  /**
   * Retrieves a job by its ID.
   *
   * @param jobId - The ID of the job to retrieve.
   * @returns A promise that resolves to the job details, including the Bull job and queue.
   */
  async getJob(jobId: number) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      omit: {
        payload: true,
        sentryBaggage: true,
        sentryTrace: true,
      },
    });

    if (!job) {
      throw new Error(`Job with ID ${jobId} not found`);
    }

    const queue = this.getQueue(job.workflowId);
    const bullJob = await queue.getJob(`#${job.bullId}`);

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
    const row = await this.prisma.jobStep.findFirst({
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
   * Waits for a job to finish processing.
   *
   * @param jobId - The ID of the job to wait for.
   * @param ttl - The time-to-live in milliseconds to wait for the job to finish.
   * @returns A promise that resolves when the job is completed.
   */
  async waitForJob(jobId: number, ttl = 1000 * 60 * 5) {
    const { bullJob, job } = await this.getJob(jobId);

    if (await bullJob.isCompleted()) {
      return;
    }

    const dbFlow = await this.getDBFlow(job.workflowId);
    const flow = this.resolveClass(dbFlow.key, true);

    await bullJob.waitUntilFinished(flow.queueEvents, ttl);
  }

  /**
   * Retrieves the options for a specific workflow.
   *
   * @param identifier - The workflow class to get options for.
   * @param _throw - Whether to throw an error if the workflow is not found.
   * @returns The options for the workflow, or null if not found.
   */
  getOptions(identifier: typeof WorkflowBase, _throw?: true) {
    const flow = this.resolveClass(identifier, _throw);

    if (!flow) {
      return null;
    }

    return this.reflector.get<WorkflowOptions | null>('HBH_FLOW', flow);
  }

  /**
   * Retrieves the queue for a specific workflow.
   *
   * @param identifier - The workflow to get the queue for.
   */
  getQueue(identifier: any) {
    return this.resolveClass(identifier, true).queue;
  }

  /**
   * Resolves a workflow class based on the provided identifier.
   *
   * @param identifier - The identifier for the workflow.
   * Can be a workflow name, an instance of WorkflowBase, or a class extending it.
   * @param _throw - Whether to throw an error if the workflow is not found.
   * @returns The resolved workflow class or null if not found.
   */
  resolveClass<
    T extends true | undefined,
    R = T extends true ? typeof WorkflowBase : typeof WorkflowBase | null,
  >(identifier: any, _throw?: T): R {
    let flow: typeof WorkflowBase | null = null;

    if (typeof identifier === 'number') {
      const dbFlow = this.dbFlowsById.get(identifier);

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
              this.reflector.get<WorkflowOptions | null>(
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
    let flow: typeof WorkflowBase | null = null;
    let dbFlow: DBWorkflow | null = null;

    if (typeof identifier === 'number') {
      // Careful not to use `this.resolveClass` anywhere outside this scope in this method
      // because you may end up with an infinite loop
      if (this.dbFlowsById.has(identifier)) {
        return this.dbFlowsById.get(identifier)!;
      }

      dbFlow = await this.prisma.workflow.findUnique({
        where: { id: identifier },
      });

      if (!dbFlow) {
        throw new WorkflowNotFoundException(
          `Workflow with ID ${identifier} not found in the database`,
        );
      }

      flow =
        this.flows.find(
          (f) =>
            this.getOptions(f)?.key === dbFlow!.key || f.name === dbFlow!.key,
        ) ?? null;

      if (!flow) {
        // The workflow isn't registered in the DI container or the class doesn't exist
        throw new WorkflowNotFoundException(
          `Workflow with name ${dbFlow.key} not found in the DI container`,
        );
      }
    } else {
      flow = this.resolveClass(identifier, true);
    }

    const options = this.getOptions(flow!);
    const key = options?.key ?? flow!.name;

    dbFlow = this.dbFlowsByKey.get(key) ?? null;

    if (!dbFlow) {
      // Try to find the workflow by its name or key
      dbFlow = await this.prisma.workflow.findFirst({
        where: {
          key: {
            in: [flow!.name, options?.key].filter(Boolean) as string[],
          },
        },
      });
    }

    if (!dbFlow) {
      // Still not found, we need to create one
      // upsert is used to prevent concurrency issues
      dbFlow = await this.prisma.workflow.upsert({
        where: { key: options?.key ?? flow!.name },
        create: {
          key,
        },
        update: {
          key,
        },
      });
    }

    this.dbFlowsByKey.set(key, dbFlow);
    this.dbFlowsById.set(dbFlow.id, dbFlow);

    return dbFlow;
  }

  /**
   * Updates the database workflow with the provided data.
   *
   * @param identifier - The identifier for the workflow
   * Can be a workflow name, an instance of WorkflowBase, or a class extending it.
   * @param data - The data to update the workflow with.
   * @returns A promise that resolves to the updated DBWorkflow object.
   */
  async updateDBFlow(
    identifier: any,
    data: Prisma.WorkflowUpdateInput,
  ): Promise<DBWorkflow> {
    const dbFlow = await this.getDBFlow(identifier);

    const updated = await this.prisma.workflow.update({
      where: { id: dbFlow.id },
      data,
    });

    this.dbFlowsByKey.set(updated.key, updated);
    this.dbFlowsById.set(updated.id, updated);

    if (dbFlow.active !== updated.active) {
      const queue = this.getQueue(identifier);

      if (updated.active) {
        await queue.resume();
      } else {
        await queue.pause();
      }
    }

    this.globalEvent.emit('workflow.updated', updated, true);

    return updated;
  }
}
