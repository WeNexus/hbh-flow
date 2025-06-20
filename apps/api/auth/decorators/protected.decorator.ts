import { applyDecorators, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth.guard.js';

export function Protected() {
  return applyDecorators(UseGuards(AuthGuard));
}
