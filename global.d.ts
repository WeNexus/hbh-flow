import { AuthContext } from '#lib/auth/types';
import { Socket } from 'socket.io';
import 'express';

declare global {
  namespace Express {
    export interface Request {
      auth?: AuthContext;
    }
  }
}

declare module 'socket.io' {
  // or 'socket.io-client'
  interface Socket {
    auth?: AuthContext;
  }
}
