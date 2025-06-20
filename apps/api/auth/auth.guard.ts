import { PrismaService } from '#lib/core/prisma.service.js';
import { AuthContext } from './types/auth.context.js';
import { JwtPayload } from './types/jwt-payload.js';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import argon2 from 'argon2';

import {
  UnauthorizedException,
  ExecutionContext,
  CanActivate,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();

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
        },
      );
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      // Token verification failed
      throw new UnauthorizedException('Invalid access token');
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

    req.auth = new AuthContext(jwtPayload, this.prisma);

    return true;
  }
}
