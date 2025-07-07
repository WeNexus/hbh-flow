import { SetupCronWorkflow } from '#lib/workflow/misc/setup-cron.workflow';
import { WorkflowService } from './workflow.service.js';
import { DynamicModule, Type } from '@nestjs/common';

import {
  INTERNAL_WORKFLOWS,
  WorkflowBase,
  WORKFLOWS,
} from '#lib/workflow/misc';

export class WorkflowModule {
  static register(workflows: Type<WorkflowBase>[]): DynamicModule {
    const internalWorkflows = [SetupCronWorkflow];

    return {
      module: WorkflowModule,
      providers: [
        WorkflowService,
        {
          provide: WORKFLOWS,
          useValue: workflows,
        },
        {
          provide: INTERNAL_WORKFLOWS,
          useValue: internalWorkflows,
        },
        ...workflows,
        ...internalWorkflows,
      ],
      exports: [WorkflowService, WORKFLOWS, ...workflows],
    };
  }
}
