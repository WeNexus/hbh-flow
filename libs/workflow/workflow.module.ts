import { WorkflowService } from './workflow.service.js';
import { SetupCronWorkflow } from '#lib/workflow/misc';
import { DiscoveryModule } from '@nestjs/core';
import { Module } from '@nestjs/common';

@Module({
  imports: [DiscoveryModule],
  providers: [WorkflowService, SetupCronWorkflow],
  exports: [WorkflowService],
})
export class WorkflowModule {}
