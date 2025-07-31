import { WorkflowService } from './workflow.service.js';
import { DiscoveryModule } from '@nestjs/core';
import { Module } from '@nestjs/common';

import {
  SetupEventsWorkflow,
  SetupCronWorkflow,
} from '#lib/workflow/workflows';

@Module({
  imports: [DiscoveryModule],
  providers: [WorkflowService, SetupCronWorkflow, SetupEventsWorkflow],
  exports: [WorkflowService],
})
export class WorkflowModule {}
