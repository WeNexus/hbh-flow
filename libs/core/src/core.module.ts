import { EnvService } from './env/env.service.js';
import { Global, Module } from '@nestjs/common';

@Global()
@Module({
  providers: [EnvService],
  exports: [EnvService],
})
export class CoreModule {}
