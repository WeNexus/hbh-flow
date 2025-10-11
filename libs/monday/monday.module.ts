import { MondayService } from './monday.service';
import { Module } from '@nestjs/common';

@Module({
  providers: [MondayService],
  exports: [MondayService],
})
export class MondayModule {}
