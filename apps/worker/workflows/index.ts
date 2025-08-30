import { PushCrmContactToBigcommerceWorkflow } from '#app/worker/workflows/push-crm-contact-to-bigcommerce.workflow';
import { WorkflowBase } from '#lib/workflow/misc/workflow-base.js';
import { Type } from '@nestjs/common';

export const workflows: Type<WorkflowBase>[] = [
  PushCrmContactToBigcommerceWorkflow,
];
