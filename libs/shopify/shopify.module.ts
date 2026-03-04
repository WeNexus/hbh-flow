import { Shopify2Service } from './shopify2.service';
import { ShopifyService } from './shopify.service';
import { Module } from '@nestjs/common';

@Module({
  providers: [ShopifyService, Shopify2Service],
  exports: [ShopifyService, Shopify2Service],
})
export class ShopifyModule {}
