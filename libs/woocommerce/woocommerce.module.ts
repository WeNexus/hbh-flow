import { WoocommerceService } from './woocommerce.service';
import { Module } from '@nestjs/common';

@Module({
  providers: [WoocommerceService],
  exports: [WoocommerceService],
})
export class WoocommerceModule {}
