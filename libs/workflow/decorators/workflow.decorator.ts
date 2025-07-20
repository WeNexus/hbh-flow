import { WorkflowOptions } from '#lib/workflow/types';

import {
  applyDecorators,
  SetMetadata,
  Injectable,
  Scope,
} from '@nestjs/common';

/**
 * Decorator to mark a class as a workflow with specific options.
 * This decorator sets metadata that can be used to identify the workflow's options.
 *
 * @param options - The configuration options for the workflow.
 * @returns A class decorator that applies metadata and makes the class injectable.
 */
export function Workflow(options?: WorkflowOptions) {
  return applyDecorators(
    Injectable({ scope: Scope.TRANSIENT }),
    SetMetadata('HBH_FLOW', options ?? {}),
  );
}
