import { FujimausaService } from './fujimausa.service';
import { Module } from '@nestjs/common';

@Module({
  providers: [FujimausaService],
  exports: [FujimausaService],
})
export class FujimausaModule {}
