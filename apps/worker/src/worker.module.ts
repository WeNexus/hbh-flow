import { CoreModule } from '#lib/core/core.module.js';
import { Module } from '@nestjs/common';

@Module({
  imports: [CoreModule],
  controllers: [],
  providers: [],
})
export class WorkerModule {}
