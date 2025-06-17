import { RedisConfigService } from '#lib/core/redis/redis-config.service.js';
import { REDIS_PUB, REDIS_SUB } from '#lib/core/redis/redis.symbol.js';
import { Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

@Module({
  providers: [
    {
      provide: REDIS_SUB,
      useFactory() {
        return {
          provide: Redis,
          inject: [RedisConfigService],
          useFactory(configService: RedisConfigService) {
            return new Redis(configService.get());
          },
        };
      },
    },
    {
      provide: REDIS_PUB,
      useFactory() {
        return {
          provide: Redis,
          inject: [RedisConfigService],
          useFactory(configService: RedisConfigService) {
            return new Redis(configService.get());
          },
        };
      },
    },
  ],
})
export class RedisModule implements OnModuleDestroy {
  constructor(
    @Inject(REDIS_PUB) private readonly redisPub: Redis,
    @Inject(REDIS_SUB) private readonly redisSub: Redis,
  ) {}

  onModuleDestroy() {
    this.redisPub.disconnect();
    this.redisSub.disconnect();
  }
}
