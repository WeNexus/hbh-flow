import { createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Auth decorator to extract the authentication context from the request.
 * This decorator can be used in controllers to access the auth context.
 */

export const Auth = createParamDecorator((_, ctx) => {
  const request = ctx.switchToHttp().getRequest<Request>();
  return request.auth; // Return the auth context from the request
});
