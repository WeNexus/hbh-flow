import { Job as DBJob, JobStatus, JobStepStatus, Prisma } from '@prisma/client';
import { StepInfoSchema } from '#lib/workflow/schema/step-info.schema';
import { WorkflowOptions } from '#lib/workflow/types/workflow-options';
import type { InputJsonValue } from '@prisma/client/runtime/client';
import { TriggerType } from '#lib/workflow/misc/trigger-type.enum';
import { RepeatOptions } from '#lib/workflow/types/repeat-options';
import { DelayedError, Queue, QueueEvents, Worker } from 'bullmq';
import { WorkflowBase } from '#lib/workflow/misc/workflow-base';
import { RunOptions } from '#lib/workflow/types/run-options';
import { JobPayload } from '#lib/workflow/types/job-payload';
import { APP_TYPE, PrismaService } from '#lib/core/misc';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { REDIS_PUB } from '#lib/core/redis';
import { EnvService } from '#lib/core/env';
import { AppType } from '#lib/core/types';
import { JwtService } from '@nestjs/jwt';
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
  NoWebhookTriggerException,
  WorkflowNotFoundException,
} from './exceptions';

@Injectable()
export class WorkflowService implements OnApplicationBootstrap {
  constructor(
    private readonly discoveryService: DiscoveryService,
    @Inject(APP_TYPE) private readonly appType: AppType,
    @Inject(REDIS_PUB) private readonly redis: Redis,
    private readonly jwtService: JwtService,
    private readonly emitter: EventEmitter2,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
    private readonly moduleRef: ModuleRef,
    private readonly env: EnvService,
  ) {}

  private readonly logger = new Logger(WorkflowService.name);

  private readonly eventMap = new Map<string, Set<typeof WorkflowBase>>();
  public workflowsByName = new Map<string, typeof WorkflowBase>();
  private workflowsSet = new Set<typeof WorkflowBase>();
  public workflows: (typeof WorkflowBase)[] = [];

  /**
   * Sets up the workflows, queues, and workers when the application starts.
   *
   * @internal
   */
  onApplicationBootstrap() {
    // Queues must be set up in both Worker and API apps, so both can enqueue jobs
    // but only the Worker app will process them.

    this.workflowsSet = new Set(
      this.discoveryService
        .getProviders()
        .filter(
          (provider) =>
            provider.metatype &&
            this.reflector.get<any>('HBH_FLOW', provider.metatype),
        )
        .map((provider) => provider.metatype as typeof WorkflowBase),
    );

    this.workflows = Array.from(this.workflowsSet);

    this.workflowsByName = new Map(
      this.workflows.map((workflow) => [workflow.name, workflow]),
    );

    this.extractSteps()
      .then(() => {
        this.setupQueues();

        if (this.appType === AppType.Worker) {
          this.setupWorkers();
        } else {
          // You should be able to only trigger a workflow manually from the Worker
          // Webhook, event and cron triggers are not supported in the API app.
          this.setupTriggers();

          // Run ChownJobsWorkflow, which is an internal workflow and is used to update the name
          // of jobs in the database when the workflow name changes.
          const chownJobsWorkflow = this.workflows.find(
            (w) => w.name === 'ChownJobsWorkflow',
          )!;

          this.run(chownJobsWorkflow, {
            deduplication: {
              id: chownJobsWorkflow.name,
              ttl: this.env.isProd ? 30000 : undefined, // 30 seconds
            },
            scheduledAt: this.env.isProd
              ? new Date(Date.now() + 30000)
              : undefined, // 30 seconds from now
          }).catch((err) => {
            this.logger.error(
              // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
              `Failed to run chown jobs workflow: ${err.message}`,
            );
          });
        }
      })
      .catch((e) => {
        throw e;
      });
  }

  /**
   * Resumes a paused job in the workflow.
   * Can be a workflow name or an instance of WorkflowBase or a class extending it.
   *
   * @param jobId - The ID of the job to resume.
   */
  async resume(jobId: number) {
    const { bullJob, queue } = await this.getJob(jobId);

    if (await bullJob.isDelayed()) {
      await bullJob.changeDelay(0);
    }

    await bullJob.promote();

    if (await queue.isPaused()) {
      await queue.resume();
    }
  }

  /**
   * Runs a workflow with the provided options.
   *
   * @param workflow - The workflow to run.
   * Can be a workflow name or an instance of WorkflowBase or a class extending it.
   * @param options - Options for running the workflow, such as payload, context, and scheduling.
   * @returns A promise that resolves to the created Bull job and the corresponding database job.
   */
  async run(workflow: any, options?: RunOptions) {
    const flow = this.resolveWorkflowClass(workflow, true);
    const queue = flow.queue;

    if (!queue) {
      throw new Error(`Queue not found for workflow: ${flow.name}`);
    }

    let dbJob: DBJob | null = null;

    if (options?.deduplication?.id) {
      dbJob = await this.prisma.job.findFirst({
        where: {
          name: flow.name,
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
          name: flow.name,
          status: 'WAITING',
          payload: options?.payload as InputJsonValue,
          sentryBaggage: options?.sentry?.baggage,
          sentryTrace: options?.sentry?.trace,
          dedupeId: options?.deduplication?.id,
        },
      });
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
   * @param workflow - The workflow to repeat.
   * Can be a workflow name or an instance of WorkflowBase or a class extending it.
   * @param options - Options for repeating the workflow, such as cron pattern, timezone, and immediate execution.
   * @returns A promise that resolves to the created Bull job and the corresponding schedule.
   */
  async repeat(workflow: any, options: RepeatOptions) {
    const flow = this.resolveWorkflowClass(workflow, true);
    const queue = flow.queue;

    if (!queue) {
      throw new Error(`Queue not found for workflow: ${flow.name}`);
    }

    let schedule: Prisma.ScheduleGetPayload<object>;

    try {
      schedule = await this.prisma.schedule.upsert({
        where: {
          name_cronExpression: {
            name: options.oldName ?? flow.name,
            cronExpression: options.repeat.oldPattern ?? options.repeat.pattern,
          },
        },
        create: {
          name: flow.name,
          cronExpression: options.repeat.pattern,
        },
        update: {
          name: flow.name,
          cronExpression: options.repeat.pattern,
          active: true,
        },
      });
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e: any) {
      // After the first upsert, the new pattern becomes the active one,
      schedule = await this.prisma.schedule.upsert({
        where: {
          name_cronExpression: {
            name: flow.name,
            cronExpression: options.repeat.pattern,
          },
        },
        create: {
          name: flow.name,
          cronExpression: options.repeat.pattern,
        },
        update: {
          name: flow.name,
          cronExpression: options.repeat.pattern,
          active: true,
        },
      });
    }

    const bullJob = await queue.upsertJobScheduler(
      `#${schedule.id}`,
      {
        pattern: options.repeat.pattern,
        tz: options.repeat.timezone,
        immediately: options.repeat.immediate,
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
   * @param workflow - The workflow to generate the token for.
   * Can be a workflow name or an instance of WorkflowBase or a class extending it.
   * @param expiresIn - The expiration time for the token, in seconds or a string like '1h'.
   * @returns A promise that resolves to the generated JWT token.
   */
  async getToken(workflow: any, expiresIn: number | string) {
    const flow = this.resolveWorkflowClass(workflow, true);
    const options = this.reflector.get<WorkflowOptions | undefined>(
      'HBH_FLOW',
      flow,
    );

    if (
      !options?.triggers?.find(
        (trigger) => trigger.type === TriggerType.Webhook,
      )
    ) {
      throw new NoWebhookTriggerException();
    }

    return this.jwtService.signAsync(
      { wflow: flow.name },
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
    const jwt = await this.jwtService.verifyAsync<{ wflow: string }>(token, {
      subject: 'access',
      audience: 'workflow',
      issuer: 'webhook',
    });

    const workflow = this.workflowsByName.get(jwt.wflow);

    if (!workflow) {
      throw new WorkflowNotFoundException();
    }

    const options = this.reflector.get<WorkflowOptions | undefined>(
      'HBH_FLOW',
      workflow,
    );

    if (
      !options?.triggers?.find(
        (trigger) => trigger.type === TriggerType.Webhook,
      )
    ) {
      throw new NoWebhookTriggerException();
    }

    return this.run(workflow, {
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

    const queue = this.workflowsByName.get(job.name)?.queue;

    if (!queue) {
      throw new Error(`Queue not found for workflow: ${job.name}`);
    }

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

    await bullJob.waitUntilFinished(
      this.workflowsByName.get(job.name)!.queueEvents,
      ttl,
    );
  }

  private setupQueues() {
    const usedQueueNames = new Set<string>();

    for (const workflow of this.workflows) {
      const queueName = workflow.name;

      if (usedQueueNames.has(queueName)) {
        throw new Error(`Duplicate workflow name detected: ${queueName}`);
      }

      usedQueueNames.add(queueName);

      // Assign the queue to the workflow for later use
      workflow.queue = new Queue<JobPayload>(queueName, {
        defaultJobOptions: {
          // Remove jobs from the queue after completion or failure to reduce memory usage
          removeOnComplete: {
            count: 100, // Keep the last 100 completed jobs
            age: 1000 * 60 * 60 * 24, // Keep jobs for 24 hours
          },
          removeOnFail: {
            count: 200, // Keep the last 200 failed jobs
            age: 1000 * 60 * 60 * 48, // Keep jobs for 48 hours
          },
          attempts: 1, // Number of retry attempts for failed jobs
        },
        streams: {
          events: {
            maxLen: 1000, // Maximum number of events to keep in the stream, use low value to reduce memory usage
          },
        },
        connection: this.redis.duplicate({
          db: this.env.getString('BULL_REDIS_DB'),
          maxRetriesPerRequest: null, // Required for BullMQ
        }),
      });

      workflow.queueEvents = new QueueEvents(queueName, {
        connection: this.redis.duplicate({
          db: this.env.getString('BULL_REDIS_DB'),
          maxRetriesPerRequest: null, // Required for BullMQ
        }),
      });
    }

    this.logger.log(
      `Queues set up for: ${this.workflows.map((w) => w.name).join(', ')}`,
    );
  }

  private setupWorkers() {
    for (const workflow of this.workflows) {
      const queue = workflow.queue;

      if (!queue) {
        throw new Error(`Queue not found for workflow: ${workflow.name}`);
      }

      const options = this.reflector.get<WorkflowOptions | undefined>(
        'HBH_FLOW',
        workflow,
      );

      // Assign the worker to the workflow for later use
      workflow.worker = new Worker<JobPayload>(
        queue.name,
        async (job, token) => {
          const instance = await this.getWorkflowInstance(workflow, true);

          if (!instance) {
            throw new Error(
              `Workflow instance not found for: ${workflow.name}`,
            );
          }

          let dbJob: DBJob;

          if (job.data.dbJobId) {
            dbJob = await this.prisma.job.upsert({
              where: { id: job.data.dbJobId },
              create: {
                bullId: job.id,
                name: workflow.name,
                status: 'RUNNING',
                payload: job.data.context as InputJsonValue,
              },
              update: {
                bullId: job.id,
                status: 'RUNNING',
              },
            });
          } else {
            const schedule = await this.prisma.schedule.findUniqueOrThrow({
              where: { id: job.data.scheduleId },
            });

            dbJob = await this.prisma.job.upsert({
              where: {
                bullId: job.id,
              },
              create: {
                bullId: job.id,
                scheduleId: schedule.id,
                name: workflow.name,
                status: 'RUNNING',
              },
              update: {
                status: 'RUNNING',
              },
            });
          }

          instance.bullJob = job;
          instance.dbJob = dbJob;
          instance.queue = queue;
          instance.worker = workflow.worker;

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
      `Workers set up for: ${this.workflows.map((w) => w.name).join(', ')}`,
    );
  }

  private setupTriggers() {
    for (const workflow of this.workflows) {
      const options = this.reflector.get<WorkflowOptions | undefined>(
        'HBH_FLOW',
        workflow,
      );

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
          this.eventMap.get(event)!.add(workflow);
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

        const workflows = instance.eventMap.get(event);

        if (!workflows) {
          instance.logger.warn(`No workflows found for event: ${event}`);
          return; // No workflows for this event
        }

        for (const workflow of workflows) {
          const queue = workflow.queue;

          if (!queue) {
            instance.logger.warn(
              `Queue not found for workflow: ${workflow.name}`,
            );
            continue; // Skip if no queue is found
          }

          instance
            .run(workflow, {
              payload: payload as InputJsonValue,
              sentry: {
                trace,
                baggage,
              },
            })
            .catch((e: Error) => {
              instance.logger.error(
                `Failed to run workflow ${workflow.name} for event ${event}: ${e.message}`,
              );
            });
        }
      },
    );

    // Run SetupCronWorkflow, which is an internal workflow and is used to set up cron jobs
    const setupCronWorkflow = this.workflows.find(
      (w) => w.name === 'SetupCronWorkflow',
    )!;

    this.run(setupCronWorkflow, {
      deduplication: {
        id: setupCronWorkflow.name,
        ttl: this.env.isProd ? 30000 : undefined, // 30 seconds
      },
      scheduledAt: this.env.isProd ? new Date(Date.now() + 5000) : undefined, // 5 seconds from now
    }).catch((err) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      this.logger.error(`Failed to run setup cron workflow: ${err.message}`);
    });
  }

  private async extractSteps() {
    for (const workflow of this.workflows) {
      const instance = await this.getWorkflowInstance(workflow, true);
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

      workflow.steps = steps.sort((a, b) => a.index - b.index);
    }
  }

  private resolveWorkflowClass<
    T extends true | undefined,
    R = T extends true ? typeof WorkflowBase : typeof WorkflowBase | null,
  >(workflow: any, _throw?: T): R {
    let flow: typeof WorkflowBase | null = null;

    if (typeof workflow === 'string') {
      flow = this.workflowsByName.get(workflow) ?? null;
    }

    if (workflow instanceof WorkflowBase) {
      flow = workflow.constructor as typeof WorkflowBase;
    }

    if (this.workflowsSet.has(workflow as typeof WorkflowBase)) {
      flow = workflow as typeof WorkflowBase;
    }

    if (!flow && _throw) {
      const name = (
        typeof workflow === 'string'
          ? workflow
          : typeof workflow === 'function'
            ? (workflow as typeof WorkflowBase).name
            : workflow
      ) as string;

      throw new WorkflowNotFoundException(
        `Workflow ${name} not found in the DI container`,
      );
    }

    return flow as R;
  }

  private getWorkflowInstance<
    T extends true | undefined,
    R = T extends true ? Promise<WorkflowBase> : Promise<WorkflowBase> | null,
  >(workflow: any, _throw?: T): R {
    const flow = this.resolveWorkflowClass(workflow, _throw);

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
    const workflow = this.resolveWorkflowClass(instance, true);
    const { bullJob, dbJob } = instance;

    const steps = workflow.steps;
    // Get the step to execute
    const currentStep =
      steps.find((s) => s.method === bullJob.data.step) ?? steps[0];

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
          step: nextStep?.method,
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
        // Job status is already set to RUNNING at the beginning of the method
        // so we only update it if it has changed
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
}
