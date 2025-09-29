import { SyncInventoryWithMiamiDistroWorkflow } from './sync-inventory-with-miami-distro.workflow';
import { PushCrmContactToBigcommerceWorkflow } from './push-crm-contact-to-bigcommerce.workflow';
import { MiamiDistroInventorySyncWorkflow } from './miami-distro-inventory-sync.workflow';
import { CacheBigcommerceProductsWorkflow } from './cache-bigcommerce-products.workflow';
import { CacheInventoryCustomerWorkflow } from './cache-inventory-customer.workflow';
import { ItemWeightSyncWorkflow } from './item-weight-sync.workflow';
import { WorkflowBase } from '#lib/workflow/misc/workflow-base.js';
import { Type } from '@nestjs/common';

export const workflows: Type<WorkflowBase>[] = [
  SyncInventoryWithMiamiDistroWorkflow,
  PushCrmContactToBigcommerceWorkflow,
  MiamiDistroInventorySyncWorkflow,
  CacheBigcommerceProductsWorkflow,
  CacheInventoryCustomerWorkflow,
  ItemWeightSyncWorkflow,
];
