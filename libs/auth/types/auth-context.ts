import { JwtPayload } from '#lib/auth/types/jwt-payload';
import { User } from '@prisma/client';

export interface AuthContext {
  payload: JwtPayload;
  expiresAt: Date;
  user: Omit<User, 'password'>;
  isPowerUser: boolean;
  canWrite: boolean;
}
