import { INTERNAL_WORKFLOWS, WORKFLOWS } from './misc/workflows.symbol.js';
import { SetupCronWorkflow } from './workflows/setup-cron.workflow.js';
import { WorkflowController } from './workflow.controller.js';
import { WebhookController } from './webhook.controller.js';
import { EnvService } from '#lib/core/env/env.service.js';
import { WorkflowService } from './workflow.service.js';
import { WorkflowBase } from './misc/workflow-base.js';
import { DynamicModule, Type } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

export class WorkflowModule {
  static register(workflows: Type<WorkflowBase>[]): DynamicModule {
    const internalWorkflows = [SetupCronWorkflow];

    return {
      module: WorkflowModule,
      controllers: [WorkflowController, WebhookController],
      imports: [
        JwtModule.registerAsync({
          inject: [EnvService],
          useFactory(env: EnvService) {
            return {
              secret: env.getString('APP_KEY'),
            };
          },
        }),
      ],
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
