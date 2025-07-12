import { REDIS_PUB, REDIS_SUB } from '#lib/core/redis/redis.symbol';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GlobalEventPayload } from '#lib/core/types';
import { RUNTIME_ID } from '#lib/core/misc/symbols';
import { Redis } from 'ioredis';

/**
 * Service for handling global events across different instances of the application.
 * It uses Redis Pub/Sub to communicate events and the EventEmitter2
 * to emit events within the application.
 */
@Injectable()
export class GlobalEventService {
  constructor(
    @Inject(RUNTIME_ID) private readonly runtimeId: string,
    @Inject(REDIS_PUB) private readonly redisPub: Redis,
    @Inject(REDIS_SUB) redisSub: Redis,
    private readonly emitter: EventEmitter2,
  ) {
    redisSub
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

  private logger = new Logger(GlobalEventService.name);

  private handleMessage(channel: string, message: string): void {
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

  /**
   * Emit a global event to all instances of the application.
   * @param event The name of the event to emit.
   * @param data The data to send with the event.
   * @param broadcast Whether to broadcast the event to all instances (default: false).
   * If true, the sending instance will not receive the event.
   */
  emit<D extends object = object>(
    event: string,
    data: D,
    broadcast?: boolean,
  ): void {
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
