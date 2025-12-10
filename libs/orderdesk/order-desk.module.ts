import { OrderDeskService } from './order-desk.service';
import { Module } from '@nestjs/common';

@Module({
  providers: [OrderDeskService],
  exports: [OrderDeskService],
})
export class OrderDeskModule {}
