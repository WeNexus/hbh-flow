import { createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';

export const Auth = createParamDecorator((_, ctx) => {
  const request = ctx.switchToHttp().getRequest<Request>();
  return request.auth; // Return the auth context from the request
});
