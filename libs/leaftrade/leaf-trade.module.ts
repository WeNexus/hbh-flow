import { LeafTradeService } from './leaf-trade.service';
import { Module } from '@nestjs/common';

@Module({
  providers: [LeafTradeService],
  exports: [LeafTradeService],
})
export class LeafTradeModule {}
