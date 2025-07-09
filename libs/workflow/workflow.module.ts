import { SetupCronWorkflow } from '#lib/workflow/misc/setup-cron.workflow';
import { WorkflowBase, WORKFLOWS } from '#lib/workflow/misc';
import { WorkflowService } from './workflow.service.js';
import { DynamicModule, Type } from '@nestjs/common';

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
        ...workflows,
        ...internalWorkflows,
      ],
      exports: [WorkflowService, WORKFLOWS, ...workflows],
    };
  }
}
