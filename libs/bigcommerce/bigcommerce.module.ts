import { BigCommerceService } from './bigcommerce.service';
import { Module } from '@nestjs/common';

@Module({
  providers: [BigCommerceService],
  exports: [BigCommerceService],
})
export class BigCommerceModule {}
