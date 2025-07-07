import { AuthContext } from '../../libs/auth/types/auth.context.js';

export {};

declare global {
  namespace Express {
    export interface Request {
      auth?: AuthContext;
    }
  }
}
