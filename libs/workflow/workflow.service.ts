import { Job as DBJob, JobStatus, JobStepStatus, Prisma } from '@prisma/client';
import type { InputJsonValue } from '@prisma/client/runtime/client';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { StepInfoSchema } from './schema/step-info.schema';
import { WorkflowOptions } from './types/workflow-options';
import { TriggerType } from './misc/trigger-type.enum';
import { RepeatOptions } from './types/repeat-options';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DelayedError, Queue, Worker } from 'bullmq';
import { WORKFLOWS } from './misc/workflows.symbol';
import { WorkflowBase } from './misc/workflow-base';
import { ModuleRef, Reflector } from '@nestjs/core';
import { RunOptions } from './types/run-options';
import { JobPayload } from './types/job-payload';
import { JwtService } from '@nestjs/jwt';
import { Redis } from 'ioredis';
import _ from 'lodash';

import {
  NoWebhookTriggerException,
  WorkflowNotFoundException,
} from './exceptions';

import {
  PrismaService,
  EnvService,
  REDIS_PUB,
  APP_TYPE,
  AppType,
} from '#lib/core';

@Injectable()
export class WorkflowService {
  public readonly workflowsByName = new Map<string, typeof WorkflowBase>();
  private readonly eventMap = new Map<string, Set<typeof WorkflowBase>>();
  private readonly logger = new Logger(WorkflowService.name);

  constructor(
    @Inject(WORKFLOWS)
    public readonly workflows: (typeof WorkflowBase)[],
    @Inject(APP_TYPE) private readonly appType: AppType,
    @Inject(REDIS_PUB) private readonly redis: Redis,
    private readonly jwtService: JwtService,
    private readonly emitter: EventEmitter2,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
    private readonly moduleRef: ModuleRef,
    private readonly env: EnvService,
  ) {
    // Queues must be set up in both Worker and API apps, so both can enqueue jobs
    // but only the Worker app will process them.

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
        }
      })
      .catch((e) => {
        throw e;
      });
  }

  async resume(workflow: typeof WorkflowBase, jobId: number) {
    // @ts-expect-error private property
    const queue = workflow.queue;

    if (!queue) {
      throw new Error(`Queue not found for workflow: ${workflow.name}`);
    }

    const bullJob = await queue.getJob(`#${jobId}`);

    if (!bullJob) {
      throw new Error(`Bull job not found for ID: #${jobId}`);
    }

    if (await bullJob.isDelayed()) {
      await bullJob.changeDelay(0);
    }

    await bullJob.promote();

    if (await queue.isPaused()) {
      await queue.resume();
    }
  }

  async run(workflow: typeof WorkflowBase, options?: RunOptions) {
    // @ts-expect-error private property
    const queue = workflow.queue;

    if (!queue) {
      throw new Error(`Queue not found for workflow: ${workflow.name}`);
    }

    const dbJob = await this.prisma.job.create({
      data: {
        name: workflow.name,
        status: 'WAITING',
        payload: options?.payload as InputJsonValue,
        sentryBaggage: options?.sentry?.baggage,
        sentryTrace: options?.sentry?.trace,
      },
    });

    const bullJob = await queue.add(
      workflow.name,
      {
        dbJobId: dbJob.id,
        context: options?.context as unknown,
      },
      {
        delay: options?.scheduledAt
          ? options.scheduledAt.getTime() - Date.now()
          : 0,
        attempts: options?.maxRetries,
        jobId: `#${dbJob.id}`,
        deduplication: options?.deduplication,
      },
    );

    return {
      bullJob,
      dbJob,
    };
  }

  async repeat(workflow: typeof WorkflowBase, options: RepeatOptions) {
    // @ts-expect-error private property
    const queue = workflow.queue;

    if (!queue) {
      throw new Error(`Queue not found for workflow: ${workflow.name}`);
    }

    let schedule: Prisma.ScheduleGetPayload<object>;

    try {
      schedule = await this.prisma.schedule.upsert({
        where: {
          name_cronExpression: {
            name: options.repeat.oldName ?? workflow.name,
            cronExpression: options.repeat.oldPattern ?? options.repeat.pattern,
          },
        },
        create: {
          name: workflow.name,
          cronExpression: options.repeat.pattern,
        },
        update: {
          name: workflow.name,
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
            name: workflow.name,
            cronExpression: options.repeat.pattern,
          },
        },
        create: {
          name: workflow.name,
          cronExpression: options.repeat.pattern,
        },
        update: {
          name: workflow.name,
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
        name: workflow.name,
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

  async getToken(workflow: typeof WorkflowBase, expiresIn: number | string) {
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

    return this.jwtService.signAsync(
      { wflow: workflow.name },
      {
        subject: 'access',
        audience: 'workflow',
        issuer: 'webhook',
        expiresIn,
      },
    );
  }

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

  private setupQueues() {
    const usedQueueNames = new Set<string>();

    for (const workflow of this.workflows) {
      const queueName = workflow.name;

      if (usedQueueNames.has(queueName)) {
        throw new Error(`Duplicate workflow name detected: ${queueName}`);
      }

      usedQueueNames.add(queueName);

      // Assign the queue to the workflow for later use
      // @ts-expect-error private property
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
    }

    this.logger.log(
      `Queues set up for: ${this.workflows.map((w) => w.name).join(', ')}`,
    );
  }

  private setupWorkers() {
    for (const workflow of this.workflows) {
      // @ts-expect-error private property
      const queue = workflow.queue;

      if (!queue) {
        throw new Error(`Queue not found for workflow: ${workflow.name}`);
      }

      const options = this.reflector.get<WorkflowOptions | undefined>(
        'HBH_FLOW',
        workflow,
      );

      // Assign the worker to the workflow for later use
      // @ts-expect-error private property
      workflow.worker = new Worker<JobPayload>(
        queue.name,
        async (job, token) => {
          const instance = await this.moduleRef.resolve<WorkflowBase>(workflow);

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

          // @ts-expect-error private property
          instance.bullJob = job;
          // @ts-expect-error private property
          instance.dbJob = dbJob;
          // @ts-expect-error private property
          instance.queue = queue;
          // @ts-expect-error private property
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
          // @ts-expect-error private property
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
      const instance = await this.moduleRef.resolve<WorkflowBase>(workflow);
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

      // @ts-expect-error private property
      workflow.steps = steps.sort((a, b) => a.index - b.index);
    }
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
      // @ts-expect-error private property
      where: { id: instance.dbJob.id },
      data,
      select,
    });

    // @ts-expect-error private property
    _.merge(instance.dbJob, result);
  }

  private async execute(
    instance: WorkflowBase,
    maxRetries: number,
    token?: string,
  ) {
    // @ts-expect-error private properties
    const { bullJob, dbJob } = instance;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const steps = (instance.constructor as any).steps as StepInfoSchema[];
    // Get the step to execute
    const currentStep =
      steps.find((s) => s.method === bullJob.data.step) ?? steps[0];

    for (let i = currentStep.index - 1; i < steps.length; i++) {
      const isLastStep = i === steps.length - 1;
      const isFirstStep = i === 0;
      const stepInfo = steps[i];

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
      } catch (e) {
        error = e;
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
