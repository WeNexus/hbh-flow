import { ActivityService, PrismaService } from '#lib/core/services';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Auth, Protected } from '#lib/auth/decorators';
import { ListInputSchema } from '#lib/core/schema';
import type { AuthContext } from '#lib/auth/types';
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import argon2 from 'argon2';
import _ from 'lodash';

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Controller,
  Delete,
  Param,
  Query,
  Patch,
  Body,
  Post,
  Get,
  Res,
  Req,
} from '@nestjs/common';

import {
  UserUpdateInputSchema,
  UserCreateInputSchema,
  UserListOutputSchema,
  UserSchema,
} from '../schema';

@Controller('api/users')
export class UserController {
  constructor(
    private readonly activityService: ActivityService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('/')
  @Protected('OBSERVER')
  @ApiOperation({
    summary: 'Get a list of users',
    description: 'Retrieve a paginated list of users with optional filters.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of users retrieved successfully.',
    type: UserListOutputSchema,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid pagination or filter parameters.',
  })
  async getUsers(
    @Query() pagination: ListInputSchema,
  ): Promise<UserListOutputSchema> {
    const { page = 1, limit = 10 } = pagination;

    const where: Prisma.UserWhereInput = {
      ...(pagination.search && {
        OR: [
          { email: { contains: pagination.search, mode: 'insensitive' } },
          { name: { contains: pagination.search, mode: 'insensitive' } },
        ],
      }),
      ...pagination.filter,
    };

    const count = await this.prisma.user.count({ where });
    const data = await this.prisma.user.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: {
        [pagination.sortField || 'createdAt']: pagination.sortOrder || 'desc',
      },
      omit: {
        password: true,
        updatedAt: true,
      },
    });

    return {
      data,
      count,
      page,
      limit,
      pages: Math.ceil(count / limit),
      hasNext: page * limit < count,
      hasPrev: page > 1,
    };
  }

  @Get('/:id')
  @Protected('OBSERVER')
  @ApiOperation({
    summary: 'Get user by ID',
    description: 'Retrieve a user by their unique ID.',
  })
  @ApiResponse({
    status: 200,
    description: 'User retrieved successfully.',
    type: UserSchema,
  })
  @ApiResponse({
    status: 404,
    description: 'User not found.',
  })
  async getUserById(@Param('id') id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  @Post('/')
  @Protected('DEVELOPER')
  @ApiOperation({
    summary: 'Create a new user',
    description: 'Create a new user with the provided details.',
  })
  @ApiResponse({
    status: 201,
    description: 'User created successfully.',
    type: UserSchema,
  })
  @ApiResponse({
    status: 400,
    description:
      'Bad Request - Invalid input or user with this email already exists.',
  })
  @ApiResponse({
    status: 403,
    description:
      "Forbidden - Can't create an ADMIN user as a DEVELOPER. Or can't create a user with SYSTEM role.",
  })
  async createUser(
    @Req() req: Request,
    @Body() input: UserCreateInputSchema,
    @Auth() auth: AuthContext,
  ) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existingUser) {
      throw new BadRequestException('User with this email already exists');
    }

    // Only developers and admins can create users
    // admins can create any role, developers can only create users with roles other than ADMIN
    if (auth.user.role === 'DEVELOPER' && input.role === 'ADMIN') {
      throw new BadRequestException(
        "Can't create an ADMIN user as a DEVELOPER",
      );
    }

    const user = await this.prisma.user.create({
      data: {
        password: await argon2.hash(input.password),
        email: input.email,
        name: input.name,
        role: input.role,
      },
    });

    await this.activityService.recordActivity({
      req,
      auth,
      action: 'CREATE',
      resource: 'USER',
      resourceId: user.id.toString(),
      updated: _.omit(user, 'updatedAt'),
    });

    return _.omit(user, 'password', 'updatedAt'); // Omit sensitive fields
  }

  @Patch('/:id')
  @Post('/:id')
  @Protected('OBSERVER')
  @ApiOperation({
    summary: 'Update user by ID',
    description: 'Update user details by their unique ID.',
  })
  @ApiResponse({
    status: 200,
    description: 'User updated successfully.',
    type: UserSchema,
  })
  @ApiResponse({
    status: 404,
    description: 'User not found.',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid input.',
  })
  @ApiResponse({
    status: 403,
    description:
      "Forbidden - Can't update a SYSTEM user or your own role, or update a user to ADMIN role unless you are an ADMIN.",
  })
  async updateUser(
    @Req() req: Request,
    @Param('id') id: number,
    @Body() input: UserUpdateInputSchema,
    @Auth() auth: AuthContext,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role === 'SYSTEM') {
      throw new ForbiddenException("You can't update a system user");
    }

    // Only developers and admins and systems can update users
    // admins can update any role, developers can only update users with roles other than ADMIN
    const isPowerUser =
      auth.user.role === 'DEVELOPER' ||
      auth.user.role === 'ADMIN' ||
      auth.user.role === 'SYSTEM';
    const isSelfUpdate = auth.user.id === id;

    if (!isPowerUser && !isSelfUpdate) {
      // The user is neither a developer nor an admin, or they are trying to update a user other than themselves
      throw new ForbiddenException(
        "You don't have permission to perform this action",
      );
    }

    if (isSelfUpdate && input.role) {
      // Prevent users from changing their own role
      throw new ForbiddenException("You can't change your own role");
    }

    if (auth.user.role !== 'ADMIN' && input.role === 'ADMIN') {
      // Prevent non-admins from updating a user to ADMIN role
      throw new ForbiddenException(
        "Can't update a user to ADMIN role unless you are an ADMIN",
      );
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...input,
        password: input.password
          ? await argon2.hash(input.password)
          : undefined,
      },
    });

    await this.activityService.recordActivity({
      req,
      auth,
      action: 'UPDATE',
      resource: 'USER',
      resourceId: id.toString(),
      subAction: isSelfUpdate ? 'SELF_UPDATE' : undefined,
      data: _.omit(user, 'updatedAt'), // Original data before update
      updated: _.omit(updated, 'updatedAt'),
    });

    return _.omit(updated, 'password', 'updatedAt'); // Omit sensitive fields
  }

  @Delete('/:id')
  @Protected('DEVELOPER')
  @ApiOperation({
    summary: 'Delete user by ID',
    description: 'Delete a user by their unique ID.',
  })
  @ApiResponse({
    status: 204,
    description: 'User deleted successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found.',
  })
  @ApiResponse({
    status: 403,
    description:
      "Forbidden - Can't delete your own account or an ADMIN user as a DEVELOPER.",
  })
  async deleteUser(
    @Req() req: Request,
    @Res() res: Response,
    @Auth() auth: AuthContext,
    @Param('id') id: number,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role === 'SYSTEM') {
      throw new ForbiddenException("You can't delete a system user");
    }

    if (auth.user.id === id) {
      throw new ForbiddenException("Can't delete your own account");
    }
    if (auth.user.role === 'DEVELOPER' && user.role === 'ADMIN') {
      throw new ForbiddenException("Can't delete an ADMIN user as a DEVELOPER");
    }

    await this.prisma.user.delete({
      where: { id },
    });

    await this.activityService.recordActivity({
      req,
      auth,
      action: 'DELETE',
      resource: 'USER',
      resourceId: id.toString(),
      data: _.omit(user, 'updatedAt'), // Original data before deletion
    });

    res.status(204).send(); // No content response
  }
}
