import type { ActivityEventPayload } from '#lib/core/types';
import { Namespace, Socket } from 'socket.io';
import { ModuleRef } from '@nestjs/core';

import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { OnEvent } from '@nestjs/event-emitter';

@WebSocketGateway({ namespace: 'activities' })
export class ActivityGateway implements OnGatewayConnection {
  constructor(private readonly moduleRef: ModuleRef) {}

  @WebSocketServer()
  namespace: Namespace;

  async handleConnection(socket: Socket) {
    const { AuthGuard } = await import('#lib/auth/auth.guard');
    const guard = await this.moduleRef.resolve(AuthGuard);

    try {
      await guard.authenticateSocket(socket);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      socket.disconnect(true);
    }
  }

  @OnEvent('activity.*')
  notifyActivity(payload: ActivityEventPayload) {
    this.namespace.emit('activity', payload);
  }
}
