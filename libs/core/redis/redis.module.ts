import { Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { RedisConfigService } from './redis-config.service.js';
import { REDIS_PUB, REDIS_SUB } from './redis.symbol.js';
import { Redis } from 'ioredis';

@Module({
  providers: [
    RedisConfigService,
    {
      provide: REDIS_SUB,
      inject: [RedisConfigService],
      useFactory(configService: RedisConfigService) {
        return new Redis(configService.get());
      },
    },
    {
      provide: REDIS_PUB,
      inject: [RedisConfigService],
      useFactory(configService: RedisConfigService) {
        return new Redis(configService.get());
      },
    },
  ],
  exports: [REDIS_PUB, REDIS_SUB, RedisConfigService],
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
