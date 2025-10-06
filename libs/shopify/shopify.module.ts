import { ShopifyService } from './shopify.service';
import { Module } from '@nestjs/common';

@Module({
  providers: [ShopifyService],
  exports: [ShopifyService],
})
export class ShopifyModule {}
