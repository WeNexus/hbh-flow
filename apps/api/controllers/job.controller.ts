import { ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { listData, PrismaWhereExceptionFilter } from '#lib/core/misc';
import { WorkflowService } from '#lib/workflow/workflow.service';
import { Auth, Protected } from '#lib/auth/decorators';
import type { AuthContext } from '#lib/auth/types';
import { ListInputSchema } from '#lib/core/schema';
import { JobResMeta } from '#lib/workflow/types';
import type { Request, Response } from 'express';
import { JsonWebTokenError } from '@nestjs/jwt';
import { JobStatus } from '@prisma/client';
import * as Sentry from '@sentry/nestjs';
import { omit } from 'lodash-es';

import {
  ActivityService,
  PostgresService,
  PrismaService,
} from '#lib/core/services';

import {
  JobReplayInputSchema,
  JobListOutputSchema,
  JobDetailSchema,
  JobSchema,
} from '../schema';

import {
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  Controller,
  UseFilters,
  Param,
  Query,
  Post,
  Get,
  Body,
  Req,
  Res,
} from '@nestjs/common';

@Controller('api/jobs')
export class JobController {
  constructor(
    private readonly workflowService: WorkflowService,
    private readonly activityService: ActivityService,
    private readonly postgresService: PostgresService,
    private readonly prisma: PrismaService,
  ) {}

  private finishedStatuses = new Set<JobStatus>([
    'CANCELLED',
    'FAILED',
    'SUCCEEDED',
  ]);

  private async verifyJobToken(id: number, token?: string, auth?: AuthContext) {
    if (!auth && !token) {
      throw new UnauthorizedException(
        'You must be authenticated or provide a token to perform this action.',
      );
    }

    if (auth) {
      if (auth.canWrite) {
        return;
      }

      throw new UnauthorizedException(
        'You do not have permission to perform this action.',
      );
    }

    try {
      const { jid } = await this.workflowService.verifyJobToken(token!);

      if (jid !== id) {
        throw new UnauthorizedException(`Token does not match job ID "${id}".`);
      }
    } catch (e: unknown) {
      if (e instanceof JsonWebTokenError) {
        throw new UnauthorizedException(
          `Invalid token provided for job ID "${id}": ${e.message}`,
        );
      }

      throw e;
    }
  }

  @Get('/')
  @Protected('OBSERVER')
  @UseFilters(PrismaWhereExceptionFilter)
  @ApiOperation({
    summary: 'List all jobs',
    description: 'Retrieves a list of all jobs in the system.',
  })
  @ApiResponse({
    status: 200,
    type: JobListOutputSchema,
  })
  async list(@Query() input: ListInputSchema): Promise<JobListOutputSchema> {
    return listData(this.prisma, 'job', input, [], {
      omit: {
        sentryTrace: true,
        sentryBaggage: true,
        options: true,
        payload: true,
        responseMeta: true,
      },
    });
  }

  @Get('/:id')
  @Protected('OBSERVER')
  @ApiOperation({
    summary: 'Get a job by ID',
    description: 'Fetches a specific job using its unique identifier.',
  })
  @ApiParam({
    name: 'id',
    description: 'The ID of the job to retrieve.',
    type: Number,
  })
  @ApiResponse({
    status: 200,
    description: 'Job retrieved successfully.',
    type: JobDetailSchema,
  })
  @ApiResponse({
    status: 404,
    description: 'Job not found.',
  })
  async single(@Param('id') id: number): Promise<JobDetailSchema> {
    try {
      const { result: job } = await this.prisma.job.findUniqueOrThrow({
        where: { id },
        include: {
          Steps: {
            omit: {
              jobId: true,
            },
            orderBy: {
              createdAt: 'asc',
            },
          },
        },
        omit: {
          sentryTrace: true,
          sentryBaggage: true,
          options: true,
        },
      });

      return job;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      throw new NotFoundException(`Job with ID "${id}" was not found.`);
    }
  }

  @Get('/:id/response')
  @Protected('OBSERVER')
  @ApiOperation({
    summary: 'Get the response of a job by ID',
    description:
      "Fetches a specific job's response using its unique identifier.",
  })
  @ApiParam({
    name: 'id',
    description: 'The ID of the job to retrieve.',
    type: Number,
  })
  @ApiResponse({
    status: 200,
    description: 'Job Response found and returned.',
  })
  @ApiResponse({
    status: 404,
    description: 'Job not found or has no response.',
  })
  async response(
    @Res({ passthrough: true }) res: Response,
    @Param('id') idParam: number,
  ): Promise<void> {
    const id = Number(idParam);

    if (!Number.isFinite(id)) {
      throw new NotFoundException(`Invalid job id "${idParam}".`);
    }

    const { result: job } = await this.prisma.job.findUniqueOrThrow({
      where: { id },
      select: {
        responseMeta: true,
      },
    });

    if (!job.responseMeta) {
      throw new NotFoundException(
        `Job with ID "${id}" has no response metadata.`,
      );
    }

    const meta = job.responseMeta as JobResMeta;

    const { result: chunkCount } = await this.prisma.jobResponseChunk.count({
      where: { jobId: id },
    });

    if (chunkCount === 0) {
      throw new NotFoundException(`Job with ID "${id}" has no response.`);
    }

    res.status(meta.statusCode ?? 200);

    if (meta.headers) {
      res.set(meta.headers);
    }

    const postgresService = this.postgresService;

    if (!res.getHeader('Content-Length')) {
      try {
        const [{ bytes }] = await postgresService.execute<
          {
            bytes: string;
          }[]
        >`SELECT COALESCE(SUM(octet_length(data)), 0)::bigint AS bytes
            FROM "JobResponseChunk"
            WHERE "jobId" = ${id}`;

        if (bytes && bytes !== '0') {
          res.setHeader('Content-Length', bytes);
        }
      } catch {
        // If this fails, we’ll just use chunked transfer encoding.
      }
    }

    const batchSize = 256; // rows per fetch; tune for your network/latency
    let aborted = false;

    const toBuffer = (d: unknown) =>
      Buffer.isBuffer(d) ? d : Buffer.from(d as Uint8Array);

    const onAbort = () => {
      aborted = true;
      // res is closed by the framework; cursor cleanup happens in finally below
    };

    res.on('close', onAbort);
    res.on('error', onAbort);

    try {
      // Cursors must run inside a transaction with Postgres.js
      await postgresService.begin(async (tx) => {
        // Order by primary key to preserve append order
        const q = tx`SELECT data
               FROM "JobResponseChunk"
              WHERE "jobId" = ${id}
              ORDER BY "id" ASC`;

        // Postgres.js cursor API: fetch rows in batches without buffering all
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        await q.cursor(batchSize, async (rows) => {
          if (aborted || !rows?.length) return false; // stop if client went away or nothing left

          for (const r of rows as Array<{ data: Uint8Array | Buffer }>) {
            if (aborted) return false;
            const chunk = toBuffer(r.data);
            if (!res.write(chunk)) {
              // Respect backpressure
              await new Promise<void>((resolve) => res.once('drain', resolve));
            }
          }
          // return true to continue fetching next batch
          return !aborted;
        });
      });

      if (!aborted) res.end();
    } catch (err) {
      if (!aborted) {
        // Bubble the error to the client only if they’re still connected
        res.destroy(err as Error);
      }
    }
  }

  @Post('/:id/replay')
  @Protected('DATA_ENTRY')
  @ApiOperation({
    summary: 'Replay a job by ID',
    description: 'Initiates a manual replay of the specified job.',
  })
  @ApiParam({
    name: 'id',
    description: 'The ID of the job to replay.',
    type: Number,
  })
  @ApiResponse({
    status: 201,
    description: 'Replay initiated successfully.',
    type: JobSchema,
  })
  async replay(
    @Param('id') id: number,
    @Body() input: JobReplayInputSchema,
    @Auth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<JobSchema> {
    id = Number(id);

    if (isNaN(id)) {
      throw new NotFoundException(`Job with ID "${id}" was not found.`);
    }

    const { result: job } = await this.prisma.job.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        workflowId: true,
        payload: true,
      },
    });

    if (!job) {
      throw new NotFoundException(`Job with ID "${id}" was not found.`);
    }

    if (!this.finishedStatuses.has(job.status)) {
      throw new BadRequestException(
        `Job with ID "${id}" is still running or has not finished yet.`,
      );
    }

    const flow = await this.workflowService.resolveClass(job.workflowId);

    if (!flow) {
      throw new NotFoundException(
        `Workflow with ID "${job.workflowId}" was not found.`,
      );
    }

    if (input.steps && (input.from || input.to)) {
      throw new BadRequestException(
        'You can provide either "steps" or "from"/"to", but not both.',
      );
    }

    // Validate steps if provided
    if (input.steps) {
      const invalidSteps = input.steps.filter(
        (step) => !flow.steps.some((s) => s.method === step),
      );

      if (invalidSteps.length > 0) {
        throw new BadRequestException(
          `Invalid step(s) provided: ${invalidSteps.join(
            ', ',
          )}. Available steps are: ${flow.steps
            .map((s) => s.method)
            .join(', ')}.`,
        );
      }
    }

    // Validate from/to if provided
    if (input.from || input.to) {
      const stepMethods = flow.steps.map((s) => s.method);
      if (input.from && !stepMethods.includes(input.from)) {
        throw new BadRequestException(
          `Invalid "from" step provided: ${input.from}. Available steps are: ${stepMethods.join(
            ', ',
          )}.`,
        );
      }
      if (input.to && !stepMethods.includes(input.to)) {
        throw new BadRequestException(
          `Invalid "to" step provided: ${input.to}. Available steps are: ${stepMethods.join(
            ', ',
          )}.`,
        );
      }
      if (
        input.from &&
        input.to &&
        stepMethods.indexOf(input.from) > stepMethods.indexOf(input.to)
      ) {
        throw new BadRequestException(
          `"from" step (${input.from}) must come before "to" step (${input.to}).`,
        );
      }
    }

    const span = Sentry.getActiveSpan();
    const trace = Sentry.getTraceData({ span });

    const { job: newJob } = await this.workflowService.run(flow, {
      userId: auth.user.id,
      parentId: job.id,
      steps: input.steps,
      from: input.from,
      to: input.to,
      context: input.context
        ? (JSON.parse(input.context) as Record<string, any>)
        : undefined,
      payload: job.payload,
      maxRetries: 1,
      trigger: 'MANUAL',
      deduplication: {
        id: `replay:${job.id}`,
      },
      sentry: {
        trace: trace?.['sentry-trace'],
        baggage: trace?.baggage,
      },
    });

    // Log the job replay activity
    await this.activityService.recordActivity({
      req,
      action: 'OTHER',
      resource: 'JOB',
      resourceId: job.id,
      subAction: 'REPLAY',
      userId: auth.user.id,
    });

    return omit(newJob, 'sentryTrace', 'sentryBaggage', 'options', 'payload');
  }

  @Post('/:id/resume')
  @Protected('ANONYMOUS')
  @ApiOperation({
    summary: 'Resume a paused job by ID',
    description: 'Resumes a job that is currently paused.',
  })
  @ApiParam({
    name: 'id',
    description: 'The ID of the job to resume.',
    type: Number,
  })
  @ApiQuery({
    name: 'token',
    description: 'Optional token to resume the job.',
    required: false,
    type: String,
  })
  @ApiResponse({
    status: 204,
    description: 'Job resumed successfully.',
  })
  async resume(
    @Param('id') id: number,
    @Req() req: Request,
    @Auth() auth?: AuthContext,
    @Query('token') token?: string,
  ): Promise<void> {
    await this.verifyJobToken(id, token, auth);

    const { result: job } = await this.prisma.job.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        workflowId: true,
      },
    });

    if (!job) {
      throw new NotFoundException(`Job with ID "${id}" was not found.`);
    }

    if (job.status !== 'PAUSED') {
      throw new BadRequestException(
        `Job with ID "${id}" is not paused and cannot be resumed.`,
      );
    }

    const flow = await this.workflowService.resolveClass(job.workflowId);

    if (!flow) {
      throw new NotFoundException(
        `Workflow with ID "${job.workflowId}" was not found.`,
      );
    }

    await this.workflowService.resume(job.id, req.body, auth?.user.id, req);
  }

  @Post('/:id/cancel')
  @Protected('ANONYMOUS')
  @ApiOperation({
    summary: 'Cancel a job by ID',
    description: 'Cancels a job that is currently paused or delayed.',
  })
  @ApiParam({
    name: 'id',
    description: 'The ID of the job to cancel.',
    type: Number,
  })
  @ApiResponse({
    status: 204,
    description: 'Job cancelled successfully.',
  })
  async cancel(
    @Param('id') id: number,
    @Req() req: Request,
    @Auth() auth?: AuthContext,
    @Query('token') token?: string,
  ): Promise<void> {
    id = Number(id);

    if (isNaN(id)) {
      throw new NotFoundException(`Job with ID "${id}" was not found.`);
    }

    await this.verifyJobToken(id, token, auth);

    const { result: job } = await this.prisma.job.findUnique({
      where: { id },
      omit: {
        options: true,
        payload: true,
        sentryTrace: true,
        sentryBaggage: true,
        updatedAt: true,
      },
    });

    if (!job) {
      throw new NotFoundException(`Job with ID "${id}" was not found.`);
    }

    if (job.status === 'SUCCEEDED' || job.status === 'FAILED') {
      throw new BadRequestException(
        `Job with ID "${id}" has already finished and cannot be cancelled.`,
      );
    }

    if (!['DELAYED', 'WAITING_RERUN', 'PAUSED'].includes(job.status)) {
      throw new BadRequestException(
        `Job with ID "${id}" is not paused or delayed and cannot be cancelled.`,
      );
    }

    await this.workflowService.cancel(job.id, auth?.user.id, req);
  }

  @Post('/:id/execute')
  @Protected('DATA_ENTRY')
  @ApiOperation({
    summary: 'Execute a job by ID',
    description: 'Executes a job which is in a DRAFT state',
  })
  @ApiParam({
    name: 'id',
    description: 'The ID of the job to execute.',
    type: Number,
  })
  @ApiResponse({
    status: 204,
    description: 'Job executed successfully.',
  })
  async execute(
    @Param('id') id: number,
    @Req() req: Request,
    @Auth() auth: AuthContext,
  ): Promise<void> {
    try {
      await this.workflowService.executeDraft(id, auth.user.id, req);
    } catch (e: unknown) {
      if (e instanceof Error) {
        throw new NotFoundException(e.message);
      }
    }
  }
}
