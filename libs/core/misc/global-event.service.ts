import { REDIS_PUB, REDIS_SUB } from '#lib/core/redis/redis.symbol';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GlobalEventPayload } from '#lib/core/types';
import { RUNTIME_ID } from './runtime-id.symbol';
import { Redis } from 'ioredis';

@Injectable()
export class GlobalEventService {
  constructor(
    @Inject(RUNTIME_ID) private readonly runtimeId: string,
    @Inject(REDIS_PUB) private readonly redisPub: Redis,
    @Inject(REDIS_SUB) private readonly redisSub: Redis,
    private readonly emitter: EventEmitter2,
  ) {
    redisPub
      .subscribe('global-events')
      .then(() => {
        redisSub.on('message', (channel: string, message: string) =>
          this.handleMessage(channel, message),
        );

        this.logger.log('Subscribed to global events channel');
      })
      .catch((e: Error) =>
        this.logger.error(
          'Failed to subscribe to global events channel',
          e.stack,
        ),
      );
  }

  private readonly logger = new Logger(GlobalEventService.name);

  handleMessage(channel: string, message: string): void {
    // TODO: Integrate Sentry

    let data: GlobalEventPayload;

    try {
      data = JSON.parse(message) as GlobalEventPayload;
    } catch (e: unknown) {
      // ignore invalid JSON messages for now
      return this.logger.error(
        `Invalid JSON message received on channel ${channel}: ${message}`,
        e instanceof Error ? e.stack : String(e),
      );
    }

    if (data.broadcast && data.runtimeId === this.runtimeId) {
      // Ignore messages sent by this runtime
      return;
    }

    // Emit the event with the global prefix if it doesn't already have it
    this.emitter.emit(
      !data.event.startsWith('global.') ? `global.${data.event}` : data.event,
      data.data,
    );
  }

  emit(event: string, data: object, broadcast?: boolean): void {
    const payload: GlobalEventPayload = {
      runtimeId: this.runtimeId,
      event,
      data,
      broadcast,
    };

    this.redisPub
      .publish('global-events', JSON.stringify(payload))
      .catch((e: Error) =>
        this.logger.error(`Failed to publish global event ${event}`, e.stack),
      );
  }
}
