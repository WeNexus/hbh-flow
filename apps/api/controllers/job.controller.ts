import { ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { listData, PrismaWhereExceptionFilter } from '#lib/core/misc';
import { ActivityService, PrismaService } from '#lib/core/services';
import { WorkflowService } from '#lib/workflow/workflow.service';
import { Auth, Protected } from '#lib/auth/decorators';
import type { AuthContext } from '#lib/auth/types';
import { ListInputSchema } from '#lib/core/schema';
import { JsonWebTokenError } from '@nestjs/jwt';
import { JobStatus } from '@prisma/client';
import * as Sentry from '@sentry/nestjs';
import type { Request } from 'express';

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
} from '@nestjs/common';
import { omit } from 'lodash-es';

@Controller('api/jobs')
export class JobController {
  constructor(
    private readonly workflowService: WorkflowService,
    private readonly activityService: ActivityService,
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

    if (auth && !auth.canWrite) {
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

    const span = Sentry.getActiveSpan();
    const trace = Sentry.getTraceData({ span });

    const { job: newJob } = await this.workflowService.run(flow, {
      userId: auth.user.id,
      parentId: job.id,
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

    await this.workflowService.resume(
      job.id,
      req.body,
      auth?.user.id ?? 1,
      req,
    );
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

    await this.workflowService.cancel(job.id, auth?.user.id ?? 1, req);
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

    if (job.status !== 'DRAFT') {
      throw new BadRequestException(
        `Job with ID "${id}" is not in a DRAFT state and cannot be executed.`,
      );
    }

    const flow = await this.workflowService.resolveClass(job.workflowId);

    if (!flow) {
      throw new NotFoundException(
        `Workflow with ID "${job.workflowId}" was not found.`,
      );
    }

    await this.workflowService.executeDraft(job.id);

    await this.activityService.recordActivity({
      req,
      userId: auth.user.id,
      action: 'OTHER',
      resource: 'JOB',
      resourceId: job.id,
      subAction: 'EXECUTE_DRAFT',
    });
  }
}
