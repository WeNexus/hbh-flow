import { AuthGuard } from '#lib/auth/auth.guard';
import { Role } from '@prisma/client';

import {
  applyDecorators,
  CustomDecorator,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';

/**
 * Decorator to protect routes with authentication and optional role-based access control.
 * If a role is provided, it will check if the user has that role or higher.
 *
 * @param {Role} [role] - The lowest role required to access the route. If not provided, no authentication is required.
 * @returns {MethodDecorator & ClassDecorator} - The combined decorators for authentication and role-based access control.
 */
export function Protected(role?: Role) {
  const decorators: (CustomDecorator | MethodDecorator | ClassDecorator)[] = [];

  // Do not apply the decorator if the role is not provided
  if (role) {
    decorators.push(SetMetadata('HBH_USER_ROLE', role));
  }

  decorators.push(UseGuards(AuthGuard));

  return applyDecorators(...decorators);
}
