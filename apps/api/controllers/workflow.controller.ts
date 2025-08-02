import { ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { listData, PrismaWhereExceptionFilter } from '#lib/core/misc';
import { ActivityService, PrismaService } from '#lib/core/services';
import { WorkflowService } from '#lib/workflow/workflow.service';
import { TriggerMetaSchema } from '#lib/workflow/schema';
import { Auth, Protected } from '#lib/auth/decorators';
import type { AuthContext } from '#lib/auth/types';
import { ListInputSchema } from '#lib/core/schema';
import { Prisma } from '@prisma/client';
import { omit } from 'lodash-es';
import express from 'express';

import {
  NotFoundException,
  UseFilters,
  Controller,
  Param,
  Query,
  Patch,
  Body,
  Get,
  Req,
} from '@nestjs/common';

import {
  WorkflowUpdateInputSchema,
  WorkflowListOutputSchema,
  WorkflowDetailSchema,
  WorkflowSchema,
} from '../schema';

@Controller('api/workflows')
export class WorkflowController {
  constructor(
    private readonly activityService: ActivityService,
    private readonly workflowService: WorkflowService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('/')
  @Protected('OBSERVER')
  @UseFilters(PrismaWhereExceptionFilter)
  @ApiOperation({
    summary: 'List all available workflows',
    description:
      'Retrieves a paginated list of all workflows registered in the system.',
  })
  @ApiParam({
    name: 'idOrKey',
    description: 'The numeric ID or string key of the workflow.',
  })
  @ApiResponse({
    status: 200,
    description: 'Workflows retrieved successfully.',
    type: WorkflowListOutputSchema,
  })
  async list(
    @Query() input: ListInputSchema,
  ): Promise<WorkflowListOutputSchema> {
    return listData(this.prisma, 'workflow', input, ['key']);
  }

  @Get('/:idOrKey')
  @Protected('OBSERVER')
  @ApiOperation({
    summary: 'Get a workflow by ID or key',
    description:
      'Fetches a specific workflow using its numeric ID or string key.',
  })
  @ApiParam({
    name: 'idOrKey',
    description: 'The numeric ID or string key of the workflow.',
  })
  @ApiResponse({
    status: 200,
    description: 'Workflow retrieved successfully.',
    type: WorkflowSchema,
  })
  @ApiResponse({
    status: 404,
    description: 'Workflow not found.',
  })
  async single(
    @Param('idOrKey') idOrKey: number | string,
  ): Promise<WorkflowSchema> {
    return this.getWorkflowByIdOrKey(idOrKey);
  }

  @Patch('/:idOrKey')
  @Protected('DEVELOPER')
  @ApiOperation({
    summary: 'Update a workflow',
    description:
      'Updates an existing workflow using its ID or key. You can enable/disable the workflow, assign it to a folder, and more.',
  })
  @ApiParam({
    name: 'idOrKey',
    description: 'The numeric ID or string key of the workflow to update.',
  })
  @ApiResponse({
    status: 200,
    description: 'Workflow updated successfully.',
    type: WorkflowSchema,
  })
  @ApiResponse({
    status: 404,
    description: 'Workflow not found.',
  })
  async update(
    @Param('idOrKey') idOrKey: number | string,
    @Req() req: express.Request,
    @Auth() auth: AuthContext,
    @Body() input: WorkflowUpdateInputSchema,
  ): Promise<WorkflowSchema> {
    const workflow = await this.getWorkflowByIdOrKey(idOrKey);

    const { result: updated } = await this.prisma.workflow.update({
      where: {
        id: workflow.id,
      },
      data: input,
    });

    if (updated.active !== workflow.active) {
      const queue = await this.workflowService.getQueue(workflow.id);
      const alreadyPaused = await queue.isPaused();

      if (updated.active && alreadyPaused) {
        await queue.resume();
      } else if (!updated.active && !alreadyPaused) {
        await queue.pause();
      }
    }

    await this.activityService.recordActivity({
      req,
      action: 'CREATE',
      resource: 'WORKFLOW',
      resourceId: updated.id,
      userId: auth.user.id,
      data: omit(workflow, 'updatedAt'),
      updated: omit(updated, 'updatedAt'),
    });

    return updated;
  }

  @Get('/:idOrKey/details')
  @Protected('OBSERVER')
  @ApiOperation({
    summary: 'Get detailed information about a workflow',
    description:
      'Returns a detailed view of the workflow, including step definitions, queue state, job counts, and trigger configuration.',
  })
  @ApiParam({
    name: 'idOrKey',
    description: 'The numeric ID or string key of the workflow.',
  })
  @ApiResponse({
    status: 200,
    description: 'Workflow details retrieved successfully.',
    type: WorkflowDetailSchema,
  })
  @ApiResponse({
    status: 404,
    description: 'Workflow or class not found.',
  })
  async details(
    @Param('idOrKey') idOrKey: number | string,
  ): Promise<WorkflowDetailSchema> {
    const workflow = await this.getWorkflowByIdOrKey(idOrKey, {
      include: {
        _count: {
          select: { Jobs: true },
        },
      },
    });

    const flow = await this.workflowService.resolveClass(workflow.key);

    if (!flow) {
      throw new NotFoundException(
        `Workflow class for "${workflow.key}" could not be resolved.`,
      );
    }

    const { result: counts } = await this.prisma.job.groupBy({
      by: ['status'],
      where: { workflowId: workflow.id },
      _count: { status: true },
    });

    const queue = await this.workflowService.getQueue(flow);
    const config = await this.workflowService.getConfig(flow);

    return {
      id: workflow.id,
      key: workflow.key,
      folderId: workflow.folderId,
      name: flow.name,
      paused: await queue.isPaused(),
      active: workflow.active,
      steps: flow.steps,
      count: workflow._count.Jobs,
      failedCount:
        counts.find((c) => c.status === 'FAILED')?._count.status || 0,
      completedCount:
        counts.find((c) => c.status === 'SUCCEEDED')?._count.status || 0,
      activeCount: await queue.getActiveCount(),
      waitingCount: await queue.count(),
      config: config
        ? {
            ...config,
            triggers: config.triggers?.map((t) =>
              omit(t, 'oldPattern', 'immediate'),
            ),
          }
        : undefined,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
    };
  }

  @Get('/:idOrKey/triggers')
  @Protected('OBSERVER')
  @ApiOperation({
    summary: 'Get workflow triggers',
    description:
      'Returns the list of triggers associated with a given workflow.',
  })
  @ApiParam({
    name: 'idOrKey',
    description: 'The numeric ID or string key of the workflow.',
  })
  @ApiResponse({
    status: 200,
    description: 'Triggers retrieved successfully.',
    type: [TriggerMetaSchema],
  })
  @ApiResponse({
    status: 404,
    description: 'Workflow or trigger configuration not found.',
  })
  async triggers(
    @Param('idOrKey') idOrKey: number | string,
  ): Promise<TriggerMetaSchema[]> {
    const workflow = await this.getWorkflowByIdOrKey(idOrKey);
    const flow = await this.workflowService.resolveClass(workflow.key);
    const config = await this.workflowService.getConfig(flow);

    if (!config) {
      throw new NotFoundException(
        `Trigger configuration for workflow "${workflow.key}" not found.`,
      );
    }

    return (
      config.triggers?.map((trigger) =>
        omit(trigger, 'oldPattern', 'immediate'),
      ) || []
    );
  }

  private async getWorkflowByIdOrKey<
    A extends Partial<Prisma.WorkflowFindUniqueArgs>,
    R = Exclude<Prisma.Result<Prisma.WorkflowDelegate, A, 'findUnique'>, null>,
  >(idOrKey: number | string, args?: A): Promise<R> {
    idOrKey = isNaN(Number(idOrKey)) ? idOrKey : Number(idOrKey);

    const { result: workflow } = await this.prisma.workflow.findUnique({
      where: {
        id: typeof idOrKey === 'number' ? idOrKey : undefined,
        key: typeof idOrKey === 'string' ? idOrKey : undefined,
      },
      ...(args || {}),
    });

    if (!workflow) {
      throw new NotFoundException(
        `Workflow with id/key "${idOrKey}" not found`,
      );
    }

    return workflow as R;
  }
}
