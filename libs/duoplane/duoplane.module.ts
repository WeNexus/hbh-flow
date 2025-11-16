import { DuoplaneService } from './duoplane.service';
import { Module } from '@nestjs/common';

@Module({
  providers: [DuoplaneService],
  exports: [DuoplaneService],
})
export class DuoplaneModule {}
