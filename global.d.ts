import { AuthContext } from '#lib/auth/types';
import 'express';

declare global {
  namespace Express {
    export interface Request {
      auth?: AuthContext;
    }
  }
}
