import { AuthContext } from '#lib/auth';

export {};

declare global {
  namespace Express {
    export interface Request {
      auth?: AuthContext;
    }
  }
}
