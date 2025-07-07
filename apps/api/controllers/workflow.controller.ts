import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Controller, Get, Query } from '@nestjs/common';
import { PaginationSchema } from '#lib/core';
import { Reflector } from '@nestjs/core';
import { Protected } from '#lib/auth';
import _ from 'lodash';

import {
  WorkflowsBasicSchema,
  WorkflowService,
  WorkflowOptions,
  StepInfoSchema,
} from '#lib/workflow';

@Controller('api')
export class WorkflowController {
  constructor(
    private readonly workflowService: WorkflowService,
    private readonly reflector: Reflector,
  ) {}

  @Get('workflows')
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
      this.workflowService.externalWorkflows
        .slice(
          (pagination.page - 1) * pagination.limit,
          pagination.page * pagination.limit,
        )
        .map(async (workflow) => {
          const options = this.reflector.get<WorkflowOptions>(
            'HBH_FLOW',
            workflow,
          );

          // @ts-expect-error private property
          const queue = workflow.queue;

          return {
            name: workflow.name,
            paused: await queue.isPaused(),
            activeCount: await queue.getActiveCount(),
            waitingCount: await queue.getWaitingCount(),
            failingCount: await queue.getFailedCount(),
            // @ts-expect-error private property
            steps: workflow.steps as StepInfoSchema[],
            ...options,
            triggers: options.triggers?.map((t) =>
              _.omit(t, 'oldName', 'oldPattern', 'immediate'),
            ),
          };
        }),
    );
  }
}
