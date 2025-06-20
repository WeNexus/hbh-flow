import { NestExpressApplication } from '@nestjs/platform-express';
import { REDIS_PUB } from '#lib/core/redis/redis.symbol.js';
import { createAdapter } from '@socket.io/redis-adapter';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions, Server } from 'socket.io';
import { Redis } from 'ioredis';

export class RedisIoAdapter extends IoAdapter {
  constructor(private readonly app: NestExpressApplication) {
    super(app);
  }

  private adapterConstructor: ReturnType<typeof createAdapter>;

  async connectToRedis(): Promise<void> {
    const pubClient = await this.app
      .resolve<Redis>(REDIS_PUB)
      .then((c) => c.duplicate());
    const subClient = pubClient.duplicate();

    await Promise.all([pubClient.connect(), subClient.connect()]);

    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options) as Server;
    server.adapter(this.adapterConstructor);
    return server;
  }
}
