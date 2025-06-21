import { Role } from '@prisma/client';

export interface JwtPayload {
  uid: string; // User ID
  cst: string; // CSRF Token Hash
  rol: Role; // User Role. This only for the UI to use
}
