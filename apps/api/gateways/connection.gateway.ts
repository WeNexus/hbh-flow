import type { ActivityEventPayload } from '#lib/core/types';
import { Namespace, Socket } from 'socket.io';
import { OnActivity } from '#lib/core/misc';
import { ModuleRef } from '@nestjs/core';

import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';

@WebSocketGateway({ namespace: 'connections' })
export class ConnectionGateway implements OnGatewayConnection {
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

  @OnActivity(['OAUTH2_AUTH_STATE', 'OAUTH2_TOKEN'])
  notifyActivity({ activity }: ActivityEventPayload) {
    if (
      activity.resource === 'OAUTH2_TOKEN' &&
      (activity.action === 'CREATE' || activity.action === 'DELETE')
    ) {
      this.namespace.emit('activity');
    }
  }
}
