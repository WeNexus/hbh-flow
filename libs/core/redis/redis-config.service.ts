import { EnvService } from '../env/env.service.js';
import { Injectable } from '@nestjs/common';

@Injectable()
export class RedisConfigService {
  constructor(private readonly envService: EnvService) {}

  get() {
    return {
      host: this.envService.getString('REDIS_HOST', 'localhost'),
      port: this.envService.getNumber('REDIS_PORT', 6379),
      password: this.envService.getString('REDIS_PASSWORD', undefined),
      lazyConnect: true,
      tls: this.envService.getString('REDIS_TLS') === 'true' ? {} : undefined,
    };
  }
}
