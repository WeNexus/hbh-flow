import { UserSchema, LoginOutputSchema, LoginInputSchema } from '../schema';
import { ActivityService, PrismaService } from '#lib/core/services';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Protected, Auth } from '#lib/auth/decorators';
import { AuthService } from '#lib/auth/auth.service';
import type { AuthContext } from '#lib/auth/types';
import type { Request, Response } from 'express';
import argon2 from 'argon2';

import {
  BadRequestException,
  ForbiddenException,
  Controller,
  HttpCode,
  Body,
  Post,
  Res,
  Get,
  Req,
} from '@nestjs/common';

@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly activityService: ActivityService,
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('login')
  @ApiOperation({
    summary: 'User login',
    description:
      'Authenticates a user using their email and password. On success, sets an access token cookie and returns a CSRF token.',
  })
  @ApiResponse({
    status: 201,
    description: 'Login successful. Cookie and CSRF token issued.',
    type: LoginOutputSchema,
    headers: {
      'Set-Cookie': {
        description: 'Access token stored as an HTTP-only cookie.',
        schema: {
          type: 'string',
          example: 'access_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid credentials or malformed request data.',
  })
  @ApiResponse({
    status: 403,
    description: 'SYSTEM user login is blocked when ADMIN user already exists.',
  })
  async login(
    @Req() req: Request,
    @Body() input: LoginInputSchema,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginOutputSchema> {
    const { result: user } = await this.prisma.user.findUnique({
      where: { email: input.email },
    });

    if (!user || !(await argon2.verify(user.password, input.password))) {
      throw new BadRequestException('Incorrect email or password');
    }

    if (user.role === 'SYSTEM') {
      const { result: admin } = await this.prisma.user.findFirst({
        where: { role: 'ADMIN' },
        select: { id: true },
      });
      if (admin) {
        throw new ForbiddenException(
          'SYSTEM user cannot log in while an ADMIN user exists.',
        );
      }
    }

    try {
      const tokens = await this.authService.login(user);

      res.cookie('access_token', tokens.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge:
          user.role === 'SYSTEM'
            ? 60 * 60 * 1000 // 1 hour
            : 24 * 60 * 60 * 1000, // 24 hours
      });

      await this.activityService.recordActivity({
        req,
        userId: user.id,
        action: 'OTHER',
        resource: 'USER',
        resourceId: user.id,
        subAction: 'LOGIN',
      });

      return {
        csrfToken: tokens.csrfToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      throw new BadRequestException('Incorrect email or password');
    }
  }

  @Post('logout')
  @Protected()
  @ApiOperation({
    summary: 'User logout',
    description:
      'Clears the user’s access token cookie, effectively logging them out.',
  })
  @ApiResponse({
    status: 204,
    description: 'Logout successful. Access token cookie cleared.',
    headers: {
      'Set-Cookie': {
        description: 'Clears the access_token cookie.',
        schema: {
          type: 'string',
          example:
            'access_token=; Max-Age=0; HttpOnly; Secure; SameSite=Strict',
        },
      },
    },
  })
  @HttpCode(204)
  async logout(
    @Req() req: Request,
    @Auth() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.clearCookie('access_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });

    await this.activityService.recordActivity({
      req,
      userId: auth.user.id,
      action: 'OTHER',
      resource: 'USER',
      resourceId: auth.user.id,
      subAction: 'LOGOUT',
    });
  }

  @Post('refresh')
  @Protected()
  @ApiOperation({
    summary: 'Refresh access token',
    description:
      'Generates a new access token and CSRF token. Stores the token in a secure cookie.',
  })
  @ApiResponse({
    status: 201,
    description: 'New token issued and cookie set.',
    type: LoginOutputSchema,
    headers: {
      'Set-Cookie': {
        description: 'Updated access_token cookie.',
        schema: {
          type: 'string',
          example: 'access_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Refresh failed. Possibly due to invalid session.',
  })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Auth() auth: AuthContext,
  ): Promise<LoginOutputSchema> {
    try {
      const tokens = await this.authService.login(Number(auth.payload.uid));

      res.cookie('access_token', tokens.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000,
      });

      await this.activityService.recordActivity({
        req,
        userId: auth.user.id,
        action: 'OTHER',
        resource: 'USER',
        resourceId: auth.user.id,
        subAction: 'REFRESH_TOKEN',
      });

      return {
        csrfToken: tokens.csrfToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      throw new BadRequestException('Failed to refresh token');
    }
  }

  @Get('whoami')
  @Protected()
  @ApiOperation({
    summary: 'Get current user info',
    description:
      'Retrieves details of the currently logged-in user from the session context.',
  })
  @ApiResponse({
    status: 200,
    description: 'Authenticated user returned.',
    type: UserSchema,
  })
  whoami(@Req() req: Request): UserSchema {
    return req.auth!.user;
  }
}
