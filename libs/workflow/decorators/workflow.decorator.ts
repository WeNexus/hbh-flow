import { TriggerMeta } from '../types/trigger-meta.js';
import { RateLimiterOptions } from 'bullmq';

import {
  applyDecorators,
  SetMetadata,
  Injectable,
  Scope,
} from '@nestjs/common';

export interface WorkflowOptions {
  triggers?: TriggerMeta[];
  concurrency?: number;
  limit?: RateLimiterOptions;
  maxRetries?: number;
}

export function Workflow(options?: WorkflowOptions) {
  return applyDecorators(
    Injectable({ scope: Scope.TRANSIENT }),
    SetMetadata('HBH_FLOW', options),
  );
}
