import { applyDecorators, SetMetadata } from '@nestjs/common';

export function Step(order: number) {
  return applyDecorators(SetMetadata('HBH_FLOW_STEP', order));
}
