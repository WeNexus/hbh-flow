import { WorkflowService } from '#lib/workflow/workflow.service';
import { WorkflowsBasicSchema } from '#lib/workflow/schema';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Controller, Get, Query } from '@nestjs/common';
import { WorkflowOptions } from '#lib/workflow/types';
import { PaginationSchema } from '#lib/core/schema';
import { Protected } from '#lib/auth/decorators';
import { Reflector } from '@nestjs/core';
import _ from 'lodash';

@Controller('api/workflows')
export class WorkflowController {
  constructor(
    private readonly workflowService: WorkflowService,
    private readonly reflector: Reflector,
  ) {}

  @Get('/')
  @Protected('OBSERVER')
  @ApiOperation({
    summary: 'List all available workflows',
    description:
      'Returns a list of all workflows that are available in the system.',
  })
  @ApiResponse({
    status: 200,
    type: WorkflowsBasicSchema,
  })
  workflows(
    @Query() pagination: PaginationSchema,
  ): Promise<WorkflowsBasicSchema[]> {
    if (typeof pagination.page !== 'number') {
      pagination.page = 1;
    }

    if (typeof pagination.limit !== 'number') {
      pagination.limit = 10;
    }

    return Promise.all(
      this.workflowService.workflows
        .slice(
          (pagination.page - 1) * pagination.limit,
          pagination.page * pagination.limit,
        )
        .map(async (workflow) => {
          const options = this.reflector.get<WorkflowOptions>(
            'HBH_FLOW',
            workflow,
          );

          const queue = workflow.queue;

          return {
            name: workflow.name,
            paused: await queue.isPaused(),
            activeCount: await queue.getActiveCount(),
            waitingCount: await queue.getWaitingCount(),
            failingCount: await queue.getFailedCount(),
            steps: workflow.steps,
            ...options,
            triggers: options.triggers?.map((t) =>
              _.omit(t, 'oldPattern', 'immediate'),
            ),
          };
        }),
    );
  }
}
