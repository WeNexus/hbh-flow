import { PrismaClient, User } from '@prisma/client';
import { JwtPayload } from './jwt-payload.js';

export class AuthContext {
  constructor(
    public readonly payload: JwtPayload,
    private readonly prisma: PrismaClient,
  ) {}

  private userCache: Promise<User> | null = null;

  public user(): Promise<User> {
    if (this.userCache) {
      return this.userCache;
    }

    this.userCache = this.prisma.user.findUnique({
      where: {
        id: Number(this.payload.uid),
      },
      omit: {
        password: true,
      },
    }) as Promise<User>;

    return this.userCache;
  }
}
