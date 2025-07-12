import { LoginResult } from '#lib/auth/types/login-result';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '#lib/core';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import crypto from 'crypto';
import argon2 from 'argon2';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Logs in a user by generating an access token and a CSRF token.
   * The access token is valid for 24 hours by default.
   *
   * @param {number | Pick<User, 'id' | 'role'>} userOrId - The user ID or a user object with id and role.
   * @param {string} [expiresIn='24h'] - The expiration time for the access token.
   * @returns {Promise<LoginResult>} - An object containing the access token, CSRF token, and expiration time.
   */
  async login(
    userOrId: number | Pick<User, 'id' | 'role'>,
    expiresIn: string = '24h',
  ): Promise<LoginResult> {
    const user =
      typeof userOrId === 'number'
        ? await this.prisma.user.findUnique({
            where: { id: userOrId },
            select: {
              id: true,
              role: true,
            },
          })
        : userOrId;

    // Check if user exists and password matches
    if (!user) {
      throw new Error('User not found');
    }

    // Generate Access Token and CSRF Token here
    // Access expires in 24 hours
    const csrfToken = crypto.randomUUID();
    const csrfTokenHash = await argon2.hash(csrfToken);
    const accessToken = this.jwtService.sign(
      { uid: user.id, cst: csrfTokenHash, rol: user.role },
      { expiresIn, subject: 'access', audience: 'user', issuer: 'auth' },
    );

    return {
      accessToken,
      csrfToken,
      expiresIn: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
  }
}
