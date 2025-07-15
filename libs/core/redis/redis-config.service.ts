import { EnvService } from '#lib/core/env';
import { Injectable } from '@nestjs/common';
import { RedisOptions } from 'ioredis';

/**
 * Service to provide Redis configuration options.
 */
@Injectable()
export class RedisConfigService {
  constructor(private readonly envService: EnvService) {}

  /**
   * Retrieves the Redis configuration options.
   * @returns The Redis configuration options.
   */
  get(): RedisOptions {
    return {
      host: this.envService.getString('REDIS_HOST', 'localhost'),
      port: this.envService.getNumber('REDIS_PORT', 6379),
      db: this.envService.getNumber('REDIS_DB', 0),
      password: this.envService.getString('REDIS_PASSWORD', undefined),
      tls: this.envService.getString('REDIS_TLS') === 'true' ? {} : undefined,
      lazyConnect: true,
    };
  }
}
