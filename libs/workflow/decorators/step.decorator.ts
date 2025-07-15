import { applyDecorators, SetMetadata } from '@nestjs/common';

/**
 * Decorator to mark a class as a step in a workflow with a specific order.
 * This decorator sets metadata that can be used to identify the step's order in the workflow.
 *
 * @param order - The order of the step in the workflow.
 * @returns A class decorator that applies metadata for the step order.
 */
export function Step(order: number) {
  return applyDecorators(SetMetadata('HBH_FLOW_STEP', order));
}
