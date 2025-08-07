import { Namespace, Socket } from 'socket.io';

import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';

@WebSocketGateway()
export class DefaultGateway implements OnGatewayConnection {
  constructor() {}

  @WebSocketServer()
  namespace: Namespace;

  handleConnection(socket: Socket) {
    socket.disconnect(true);
  }
}
