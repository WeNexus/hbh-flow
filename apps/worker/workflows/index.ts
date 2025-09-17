import { SyncInventoryWithMiamiDistroWorkflow } from './sync-inventory-with-miami-distro.workflow';
import { PushCrmContactToBigcommerceWorkflow } from './push-crm-contact-to-bigcommerce.workflow';
import { WorkflowBase } from '#lib/workflow/misc/workflow-base.js';
import { Type } from '@nestjs/common';

export const workflows: Type<WorkflowBase>[] = [
  SyncInventoryWithMiamiDistroWorkflow,
  PushCrmContactToBigcommerceWorkflow,
];
