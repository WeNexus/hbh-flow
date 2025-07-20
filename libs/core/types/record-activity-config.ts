import type { AuthContext } from '#lib/auth/types/auth-context';
import type { Action, Resource } from '@prisma/client';
import type { Request } from 'express';

export interface RecordActivityConfig {
  auth: AuthContext;
  req: Request;
  action: Action;
  resource?: Resource;
  resourceId?: string | number;
  subAction?: string;
  details?: Record<string, any>;

  // Revision
  data?: any;
  updated?: any;
}
