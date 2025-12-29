import { ApexTradingService } from './apex-trading.service';
import { Module } from '@nestjs/common';

@Module({
  providers: [ApexTradingService],
  exports: [ApexTradingService],
})
export class ApexTradingModule {}
