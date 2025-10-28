import { MiamiDistroHandleNotificationSubscriptionWorkflow } from './miami-distro/miami-distro-handle-notification-subscription.workflow';
import { MiamiDistroHandleShipmentUpdateWorkflow } from './miami-distro/miami-distro-handle-shipment-update.workflow';
import { MiamiDistroCustomerNotificationWorkflow } from './miami-distro/miami-distro-customer-notification.workflow';
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
import { HBHPushImageToShopifyWorkflow } from './hbh/push-image-to-shopify.workflow';
import { EastWestInventorySync } from './hbh/east-west-inventory-sync.workflow';
import { PushOrderToOdooWorkflow } from './ryot/push-order-to-odoo.workflow';
import { ItemWeightSyncWorkflow } from './hbh/item-weight-sync.workflow';
import { PriceListSyncWorkflow } from './hbh/price-list-sync.workflow';
import { WorkflowBase } from '#lib/workflow/misc/workflow-base.js';
import { DelayWorkflow } from './hbh/delay.workflow';
import { Type } from '@nestjs/common';

export const workflows: Type<WorkflowBase>[] = [
  MiamiDistroHandleNotificationSubscriptionWorkflow,
  PushFulfillmentUpdatesToBigcommerceWorkflow,
  MiamiDistroCustomerNotificationWorkflow,
  MiamiDistroHandleShipmentUpdateWorkflow,
  MiamiDistroCreateOnlineAccountWorkflow,
  SyncInventoryWithMiamiDistroWorkflow,
  PushCrmContactToBigcommerceWorkflow,
  PushOrderUpdateToInventoryWorkflow,
  MiamiDistroInventorySyncWorkflow,
  BigCommerceInventorySyncWorkflow,
  CacheBigcommerceProductsWorkflow,
  PushInventoryAdjustmentWorkflow,
  CacheInventoryCustomerWorkflow,
  HBHPushImageToShopifyWorkflow,
  MiamiDistroPushOrderWorkflow,
  PushOrderToInventoryWorkflow,
  PushOrderToOdooWorkflow,
  ItemWeightSyncWorkflow,
  PriceListSyncWorkflow,
  EastWestInventorySync,
  DelayWorkflow,
];
