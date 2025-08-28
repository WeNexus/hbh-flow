import { FlodeskService } from './flodesk.service';
import { Module } from '@nestjs/common';

@Module({
  providers: [FlodeskService],
  exports: [FlodeskService],
})
export class FlodeskModule {}
