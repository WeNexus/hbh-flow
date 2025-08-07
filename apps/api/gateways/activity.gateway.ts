import { Activity, Revision } from '@prisma/client';
import { Namespace, Socket } from 'socket.io';
import { ModuleRef } from '@nestjs/core';

import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';

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

  notifyActivity(activity: Activity, revision: Revision | null = null) {
    this.namespace.emit('activity', { activity, revision });
  }
}
