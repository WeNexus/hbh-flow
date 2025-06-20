import { Protected } from './decorators/protected.decorator.js';
import { Auth } from './decorators/auth-context.decorator.js';
import { PrismaService } from '#lib/core/prisma.service.js';
import { WhoamiOutput } from './output/whoami.output.js';
import { LoginOutput } from './output/login.output.js';
import { AuthContext } from './types/auth.context.js';
import { LoginInput } from './input/login.input.js';
import type { Response, Request } from 'express';
import { AuthService } from './auth.service.js';
import { ApiResponse } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import argon2 from 'argon2';

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
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('login')
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Incorrect email or password',
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: LoginOutput,
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
    @Body() input: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginOutput> {
    const user = await this.prisma.user.findUnique({
      where: {
        email: input.email,
      },
      select: {
        id: true,
        password: true,
      },
    });

    // Check if user exists and password matches
    if (!user || !(await argon2.verify(user.password, input.password))) {
      throw new BadRequestException('Incorrect email or password');
    }

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
  }

  @Post('logout')
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
  @Protected()
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Failed to refresh token',
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: LoginOutput,
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
  ): Promise<LoginOutput> {
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

  @Protected()
  @Get('whoami')
  @ApiResponse({
    status: 200,
    description: 'Returns the authenticated user',
    type: WhoamiOutput,
  })
  whoami(@Req() req: Request): Promise<WhoamiOutput> {
    return req.auth!.user();
  }
}
