import { WorkflowOptions } from '../types/workflow-options.js';

import {
  applyDecorators,
  SetMetadata,
  Injectable,
  Scope,
} from '@nestjs/common';

export function Workflow(options?: WorkflowOptions) {
  return applyDecorators(
    Injectable({ scope: Scope.TRANSIENT }),
    SetMetadata('HBH_FLOW', options),
  );
}
