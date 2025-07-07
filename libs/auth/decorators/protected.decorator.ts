import { AuthGuard } from '../../auth/auth.guard';
import { Role } from '@prisma/client';

import {
  applyDecorators,
  CustomDecorator,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';

export function Protected(role?: Role) {
  const decorators: (CustomDecorator | MethodDecorator | ClassDecorator)[] = [];

  // Do not apply the decorator if the role is not provided
  if (role) {
    decorators.push(SetMetadata('HBH_USER_ROLE', role));
  }

  decorators.push(UseGuards(AuthGuard));

  return applyDecorators(...decorators);
}
