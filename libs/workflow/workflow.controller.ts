import { Protected } from '#app/api/auth/decorators/protected.decorator.js';
import { PaginationSchema } from '#lib/core/schema/pagination.schema.js';
import { WorkflowsOutput } from './output/workflows.output.js';
import { WorkflowOptions } from './types/workflow-options.js';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { WorkflowService } from './workflow.service.js';
import { Controller, Get, Query } from '@nestjs/common';
import { StepInfo } from './types/step-info.js';
import { Reflector } from '@nestjs/core';
import _ from 'lodash';

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
    type: WorkflowsOutput,
  })
  workflows(@Query() pagination: PaginationSchema): Promise<WorkflowsOutput[]> {
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
            steps: workflow.steps as StepInfo[],
            ...options,
            triggers: options.triggers?.map((t) =>
              _.omit(t, 'oldName', 'oldPattern', 'immediate'),
            ),
          };
        }),
    );
  }
}
