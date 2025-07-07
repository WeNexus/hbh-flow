import { WorkflowOptions } from '../types/workflow-options';

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
