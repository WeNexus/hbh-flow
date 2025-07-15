import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from '#lib/auth/auth.service';
import type { AuthContext } from '#lib/auth/types';
import { PrismaService } from '#lib/core/services';
import { Protected } from '#lib/auth/decorators';
import type { Response, Request } from 'express';
import { Auth } from '#lib/auth/decorators';
import argon2 from 'argon2';

import {
  WhoamiOutputSchema,
  LoginOutputSchema,
  LoginInputSchema,
} from '../schema';

import {
  BadRequestException,
  Controller,
  Body,
  Post,
  Res,
  Get,
  Req,
} from '@nestjs/common';

@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('login')
  @ApiOperation({
    summary: 'User login',
    description:
      'Authenticates a user and sets an access token cookie and returns CSRF token.',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Incorrect email or password',
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: LoginOutputSchema,
    headers: {
      'Set-Cookie': {
        description: 'Access token cookie',
        schema: {
          type: 'string',
          example: 'access_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        },
      },
    },
  })
  async login(
    @Body() input: LoginInputSchema,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginOutputSchema> {
    const user = await this.prisma.user.findUnique({
      where: {
        email: input.email,
      },
      select: {
        id: true,
        role: true,
        password: true,
      },
    });

    // Check if user exists and password matches
    if (!user || !(await argon2.verify(user.password, input.password))) {
      throw new BadRequestException('Incorrect email or password');
    }

    try {
      const tokens = await this.authService.login(user);

      res.cookie('access_token', tokens.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      });

      return {
        csrfToken: tokens.csrfToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      throw new BadRequestException('Incorrect email or password');
    }
  }

  @Post('logout')
  @ApiOperation({
    summary: 'User logout',
    description: 'Logs out the user by clearing the access token cookie.',
  })
  @ApiResponse({
    status: 200,
    description: 'Logout successful',
  })
  logout(@Res({ passthrough: true }) res: Response) {
    // Clear the access token cookie
    res.clearCookie('access_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });

    return { message: 'Logged out successfully' };
  }

  @Post('refresh')
  @ApiOperation({
    summary: 'Refresh access token',
    description:
      'Refreshes the access token using the current user context. Requires a valid access token.',
  })
  @Protected()
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Failed to refresh token',
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: LoginOutputSchema,
    headers: {
      'Set-Cookie': {
        description: 'Access token cookie',
        schema: {
          type: 'string',
          example: 'access_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        },
      },
    },
  })
  async refresh(
    @Res({ passthrough: true }) res: Response,
    @Auth() auth: AuthContext,
  ): Promise<LoginOutputSchema> {
    try {
      const tokens = await this.authService.login(Number(auth.payload.uid));

      res.cookie('access_token', tokens.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      });

      return {
        csrfToken: tokens.csrfToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      throw new BadRequestException('Failed to refresh token');
    }
  }

  @Get('whoami')
  @Protected()
  @ApiOperation({
    summary: 'Get authenticated user information',
    description: 'Returns the details of the currently authenticated user.',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns the authenticated user',
    type: WhoamiOutputSchema,
  })
  whoami(@Req() req: Request): WhoamiOutputSchema {
    return req.auth!.user;
  }
}
