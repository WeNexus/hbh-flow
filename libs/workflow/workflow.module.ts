import { SetupCronWorkflow, ChownJobsWorkflow } from '#lib/workflow/workflows';
import { WorkflowService } from './workflow.service.js';
import { DiscoveryModule } from '@nestjs/core';
import { Module } from '@nestjs/common';

@Module({
  imports: [DiscoveryModule],
  providers: [WorkflowService, SetupCronWorkflow, ChownJobsWorkflow],
  exports: [WorkflowService],
})
export class WorkflowModule {}
