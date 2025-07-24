import type { Action, Resource } from '@prisma/client';
import type { Request } from 'express';

type JsonPrimitive = string | number | boolean;

export interface RecordActivityConfig {
  userId: number;
  req?: Request;
  action: Action;
  resource?: Resource;
  resourceId?: JsonPrimitive | JsonPrimitive[] | Record<string, JsonPrimitive>;
  subAction?: string;
  details?: Record<string, any>;

  // Revision
  data?: any;
  updated?: any;
}
