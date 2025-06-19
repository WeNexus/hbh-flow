import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '#lib/core/prisma.service.js';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import argon2 from 'argon2';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async login(userOrId: number | Pick<User, 'id'>, expiresIn: string = '24h') {
    const user =
      typeof userOrId === 'number'
        ? await this.prisma.user.findUnique({
            where: { id: userOrId },
          })
        : userOrId;

    // Check if user exists and password matches
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Generate Access Token and CSRF Token here
    // Access expires in 24 hours
    const csrfToken = crypto.randomUUID();
    const csrfTokenHash = await argon2.hash(csrfToken);
    const accessToken = this.jwtService.sign(
      { uid: user.id, cst: csrfTokenHash },
      { expiresIn, subject: 'access' },
    );

    return {
      accessToken,
      csrfToken,
      expiresIn: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
  }
}
