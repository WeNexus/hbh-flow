import { Protected } from './decorators/protected.decorator.js';
import { Auth } from './decorators/auth-context.decorator.js';
import { PrismaService } from '#lib/core/prisma.service.js';
import { AuthContext } from './types/auth.context.js';
import type { Response, Request } from 'express';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
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
  async login(
    @Body() input: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
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
      expiresIn: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    // Clear the access token cookie
    res.clearCookie('access_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });

    return { message: 'Logged out successfully' };
  }

  @Protected()
  @Post('refresh')
  async refresh(
    @Res({ passthrough: true }) res: Response,
    @Auth() auth: AuthContext,
  ) {
    const tokens = await this.authService.login(Number(auth.payload.uid));

    res.cookie('access_token', tokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    return {
      csrfToken: tokens.csrfToken,
      expiresIn: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  @Protected()
  @Get('whoami')
  whoami(@Req() req: Request) {
    return req.auth!.user();
  }
}
