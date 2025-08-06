import { JwtPayload } from '#lib/auth/types/jwt-payload';
import { PrismaService } from '#lib/core/services';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Role } from '@prisma/client';
import argon2 from 'argon2';

import {
  UnauthorizedException,
  ForbiddenException,
  ExecutionContext,
  CanActivate,
  Injectable,
} from '@nestjs/common';

/**
 * This guard protects routes by verifying JWT tokens,
 * checking user roles, and validating CSRF tokens for non-GET requests.
 * It ensures that only authenticated users with the appropriate permissions
 * can access the protected resources.
 */

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly rolesSorted: (Role | 'ANONYMOUS')[] = [
    'ANONYMOUS',
    'OBSERVER',
    'DATA_ENTRY',
    'DEVELOPER',
    'ADMIN',
    'SYSTEM',
  ];

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const role = this.reflector.get<Role | 'ANONYMOUS'>(
      'HBH_USER_ROLE',
      context.getHandler(),
    );

    if (role === 'ANONYMOUS' && typeof req.cookies?.access_token !== 'string') {
      // If the route is accessible to anonymous users, we don't need to check the token
      return true;
    }

    if (typeof req.cookies?.access_token !== 'string') {
      // Access token is missing
      throw new UnauthorizedException('Access token is required');
    }

    let jwtPayload: JwtPayload | null = null;

    try {
      jwtPayload = await this.jwtService.verifyAsync<JwtPayload>(
        req.cookies.access_token,
        {
          subject: 'access',
          audience: 'user',
          issuer: 'auth',
        },
      );
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      // Token verification failed
      throw new UnauthorizedException('Invalid access token');
    }

    const { result: user } = await this.prisma.user.findUnique({
      where: {
        id: Number(jwtPayload.uid),
      },
      omit: {
        password: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (!this.hasPermission(user.role, role)) {
      throw new ForbiddenException(
        'You do not have permission to access this resource',
      );
    }

    if (req.method !== 'GET') {
      if (typeof req.headers['x-csrf-token'] !== 'string') {
        // CSRF token is required for non-GET requests
        throw new UnauthorizedException('CSRF token is required');
      }

      // Validate CSRF token
      if (!(await argon2.verify(jwtPayload.cst, req.headers['x-csrf-token']))) {
        // CSRF token does not match
        throw new UnauthorizedException('Invalid CSRF token');
      }
    }

    // If we reach here, the token is valid

    req.auth = {
      user,
      payload: jwtPayload,
      canWrite: this.hasPermission(user.role, 'DATA_ENTRY'),
      isPowerUser:
        user.role === 'DEVELOPER' ||
        user.role === 'ADMIN' ||
        user.role === 'SYSTEM',
    };

    return true;
  }

  private hasPermission(
    userRole: Role,
    requiredRole: Role | 'ANONYMOUS' | undefined,
  ): boolean {
    if (!requiredRole) {
      return true; // No specific role required, allow access
    }

    const userRoleIndex = this.rolesSorted.indexOf(userRole);
    const requiredRoleIndex = this.rolesSorted.indexOf(requiredRole);

    if (userRoleIndex === -1 || requiredRoleIndex === -1) {
      // Either role is not found in the sorted list, deny access
      return false;
    }

    // Allow if the user's role is equal to or higher than the required role
    return userRoleIndex >= requiredRoleIndex;
  }
}
