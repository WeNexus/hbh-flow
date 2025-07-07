import { NestExpressApplication } from '@nestjs/platform-express';
import { createAdapter } from '@socket.io/redis-adapter';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { REDIS_PUB } from '../redis/redis.symbol';
import { ServerOptions, Server } from 'socket.io';
import { EnvService } from '../env/env.service';
import { Redis } from 'ioredis';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;

  constructor(private readonly app: NestExpressApplication) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const env = this.app.get(EnvService);

    const pubClient = await this.app.resolve<Redis>(REDIS_PUB).then((c) =>
      c.duplicate({
        db: env.getNumber('SOCKET_IO_REDIS_DB', 1),
      }),
    );
    const subClient = pubClient.duplicate({
      db: env.getNumber('SOCKET_IO_REDIS_DB', 1),
    });

    await Promise.all([pubClient.connect(), subClient.connect()]);

    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options) as Server;
    server.adapter(this.adapterConstructor);
    return server;
  }
}
