import { PushFulfillmentUpdatesToBigcommerceWorkflow } from './hbh/push-fulfillment-updates-to-bigcommerce.workflow';
import { MiamiDistroCreateOnlineAccountWorkflow } from './miami-distro/miami-distro-create-online-account.workflow';
import { MiamiDistroInventorySyncWorkflow } from './miami-distro/miami-distro-inventory-sync.workflow';
import { SyncInventoryWithMiamiDistroWorkflow } from './hbh/sync-inventory-with-miami-distro.workflow';
import { PushCrmContactToBigcommerceWorkflow } from './hbh/push-crm-contact-to-bigcommerce.workflow';
import { PushOrderUpdateToInventoryWorkflow } from './hbh/push-order-update-to-inventory.workflow';
import { MiamiDistroPushOrderWorkflow } from './miami-distro/miami-distro-push-order.workflow';
import { CacheBigcommerceProductsWorkflow } from './hbh/cache-bigcommerce-products.workflow';
import { BigCommerceInventorySyncWorkflow } from './hbh/bigcommerce-inventory-sync.workflow';
import { PushInventoryAdjustmentWorkflow } from './hbh/push-inventory-adjustment.workflow';
import { CacheInventoryCustomerWorkflow } from './hbh/cache-inventory-customer.workflow';
import { PushOrderToInventoryWorkflow } from './hbh/push-order-to-inventory.workflow';
import { EastWestInventorySync } from './hbh/east-west-inventory-sync.workflow';
import { ItemWeightSyncWorkflow } from './hbh/item-weight-sync.workflow';
import { PriceListSyncWorkflow } from './hbh/price-list-sync.workflow';
import { WorkflowBase } from '#lib/workflow/misc/workflow-base.js';
import { Type } from '@nestjs/common';

export const workflows: Type<WorkflowBase>[] = [
  PushFulfillmentUpdatesToBigcommerceWorkflow,
  MiamiDistroCreateOnlineAccountWorkflow,
  SyncInventoryWithMiamiDistroWorkflow,
  PushCrmContactToBigcommerceWorkflow,
  PushOrderUpdateToInventoryWorkflow,
  MiamiDistroInventorySyncWorkflow,
  BigCommerceInventorySyncWorkflow,
  CacheBigcommerceProductsWorkflow,
  PushInventoryAdjustmentWorkflow,
  CacheInventoryCustomerWorkflow,
  MiamiDistroPushOrderWorkflow,
  PushOrderToInventoryWorkflow,
  ItemWeightSyncWorkflow,
  PriceListSyncWorkflow,
  EastWestInventorySync,
];
