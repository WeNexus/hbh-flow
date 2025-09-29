import { SyncInventoryWithMiamiDistroWorkflow } from './sync-inventory-with-miami-distro.workflow';
import { PushCrmContactToBigcommerceWorkflow } from './push-crm-contact-to-bigcommerce.workflow';
import { MiamiDistroInventorySyncWorkflow } from './miami-distro-inventory-sync.workflow';
import { CacheBigcommerceProductsWorkflow } from './cache-bigcommerce-products.workflow';
import { WorkflowBase } from '#lib/workflow/misc/workflow-base.js';
import { Type } from '@nestjs/common';
import { CacheInventoryCustomerWorkflow } from '#app/worker/workflows/cache-inventory-customer.workflow';

export const workflows: Type<WorkflowBase>[] = [
  SyncInventoryWithMiamiDistroWorkflow,
  PushCrmContactToBigcommerceWorkflow,
  MiamiDistroInventorySyncWorkflow,
  CacheBigcommerceProductsWorkflow,
  CacheInventoryCustomerWorkflow,
];
