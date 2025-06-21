import { JwtPayload } from './jwt-payload.js';
import { User } from '@prisma/client';

export interface AuthContext {
  payload: JwtPayload;
  user: Omit<User, 'password'>;
}
