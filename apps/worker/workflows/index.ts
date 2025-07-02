import { WorkflowBase } from '#lib/workflow/misc/workflow-base.js';
import { TestWorkflow } from './test.workflow.js';
import { Type } from '@nestjs/common';

export const workflows: Type<WorkflowBase>[] = [TestWorkflow];
