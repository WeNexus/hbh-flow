import { listData, PrismaWhereExceptionFilter } from '#lib/core/misc';
import { ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { ActivityService, PrismaService } from '#lib/core/services';
import { WorkflowService } from '#lib/workflow/workflow.service';
import { Auth, Protected } from '#lib/auth/decorators';
import type { AuthContext } from '#lib/auth/types';
import { ListInputSchema } from '#lib/core/schema';
import { JobStatus } from '@prisma/client';
import type { Request } from 'express';
import { omit } from 'lodash-es';

import {
  JobReplayInputSchema,
  JobListOutputSchema,
  JobSchema,
} from '../schema';

import {
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
    type: JobSchema,
  })
  @ApiResponse({
    status: 404,
    description: 'Job not found.',
  })
  async single(@Param('id') id: number): Promise<JobSchema> {
    try {
      const { result: job } = await this.prisma.job.findUniqueOrThrow({
        where: { id },
        omit: {
          sentryTrace: true,
          sentryBaggage: true,
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

    const { dbJob } = await this.workflowService.run(flow, {
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
    });

    // Log the job replay activity
    await this.activityService.recordActivity({
      req,
      action: 'CREATE',
      resource: 'JOB',
      resourceId: dbJob.id,
      subAction: 'REPLAY',
      userId: auth.user.id,
      updated: omit(dbJob, 'updatedAt'),
    });

    return dbJob;
  }
}
