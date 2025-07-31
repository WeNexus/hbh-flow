import { PrismaExtensionRedis } from '#lib/prisma-cache';
import { PrismaClient } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { RedisOptions } from 'ioredis';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function extension() {
  return new PrismaClient().$extends(
    PrismaExtensionRedis({
      client: {} as RedisOptions,
      config: {
        auto: false,
        type: 'JSON',
        ttl: 60 * 60 * 6, // 6 hours
        stale: 60 * 60, // 1 hour
      },
    }),
  );
}

type _Client = ReturnType<typeof extension>;

@Injectable()
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class PrismaService {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type,@typescript-eslint/no-unsafe-declaration-merging
export interface PrismaService extends _Client {}
