import { ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { ActivityService, PrismaService } from '#lib/core/services';
import { Auth, Protected } from '#lib/auth/decorators';
import { ListInputSchema } from '#lib/core/schema';
import type { AuthContext } from '#lib/auth/types';
import { listData } from '#lib/core/misc';
import type { Request } from 'express';
import { omit } from 'lodash-es';
import argon2 from 'argon2';

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Controller,
  HttpCode,
  Delete,
  Param,
  Query,
  Patch,
  Body,
  Post,
  Get,
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
    summary: 'List users',
    description: 'Retrieves a paginated and optionally filtered list of users.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved the list of users.',
    type: UserListOutputSchema,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid filter or pagination input.',
  })
  async list(@Query() input: ListInputSchema): Promise<UserListOutputSchema> {
    return listData(this.prisma, 'user', input, ['email', 'name'], {
      omit: {
        updatedAt: true,
        password: true,
      },
    });
  }

  @Get('/:id')
  @Protected('OBSERVER')
  @ApiOperation({
    summary: 'Get user by ID',
    description: 'Retrieves a user by their unique numeric ID.',
  })
  @ApiParam({ name: 'id', type: Number, description: 'The user ID.' })
  @ApiResponse({
    status: 200,
    description: 'User found and returned.',
    type: UserSchema,
  })
  @ApiResponse({
    status: 404,
    description: 'User not found.',
  })
  async single(@Param('id') id: number) {
    const { result: user } = await this.prisma.user.findUnique({
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

    if (!user) throw new NotFoundException('User not found.');

    return user;
  }

  @Post('/')
  @Protected('DEVELOPER')
  @ApiOperation({
    summary: 'Create a new user',
    description:
      'Creates a new user account. Developers cannot create ADMIN users.',
  })
  @ApiResponse({
    status: 201,
    description: 'User created successfully.',
    type: UserSchema,
  })
  @ApiResponse({
    status: 400,
    description: 'Email already exists or input is invalid.',
  })
  @ApiResponse({
    status: 403,
    description: 'Restricted action: Cannot assign ADMIN or SYSTEM roles.',
  })
  async create(
    @Req() req: Request,
    @Body() input: UserCreateInputSchema,
    @Auth() auth: AuthContext,
  ) {
    const { result: existingUser } = await this.prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existingUser) {
      throw new BadRequestException('A user with this email already exists.');
    }

    if (auth.user.role === 'DEVELOPER' && input.role === 'ADMIN') {
      throw new BadRequestException(
        'You do not have permission to create an ADMIN user.',
      );
    }

    const { result: user } = await this.prisma.user.create({
      data: {
        password: await argon2.hash(input.password),
        email: input.email,
        name: input.name,
        role: input.role,
      },
    });

    await this.activityService.recordActivity({
      req,
      userId: auth.user.id,
      action: 'CREATE',
      resource: 'USER',
      resourceId: user.id,
      updated: omit(user, 'updatedAt'),
    });

    return omit(user, 'password', 'updatedAt');
  }

  @Patch('/:id')
  @Post('/:id')
  @Protected('OBSERVER')
  @ApiOperation({
    summary: 'Update user by ID',
    description:
      'Updates an existing user. Role changes are restricted, especially for SYSTEM users.',
  })
  @ApiParam({ name: 'id', type: Number, description: 'The user ID.' })
  @ApiResponse({
    status: 200,
    description: 'User updated successfully.',
    type: UserSchema,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid update input.',
  })
  @ApiResponse({
    status: 403,
    description: 'Permission denied due to role restrictions.',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found.',
  })
  @HttpCode(200)
  async update(
    @Req() req: Request,
    @Param('id') id: number,
    @Body() input: UserUpdateInputSchema,
    @Auth() auth: AuthContext,
  ) {
    const { result: user } = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) throw new NotFoundException('User not found.');

    if (user.role === 'SYSTEM') {
      throw new ForbiddenException('SYSTEM users cannot be updated.');
    }

    const isSelfUpdate = auth.user.id === id;

    if (!auth.isPowerUser && !isSelfUpdate) {
      throw new ForbiddenException(
        'You are not authorized to update this user.',
      );
    }

    if (isSelfUpdate && input.role) {
      throw new ForbiddenException('You cannot change your own role.');
    }

    if (auth.user.role !== 'ADMIN' && input.role === 'ADMIN') {
      throw new ForbiddenException('Only ADMINs can assign the ADMIN role.');
    }

    const { result: updated } = await this.prisma.user.update({
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
      userId: auth.user.id,
      action: 'UPDATE',
      resource: 'USER',
      resourceId: id,
      subAction: isSelfUpdate ? 'SELF_UPDATE' : undefined,
      data: omit(user, 'updatedAt'),
      updated: omit(updated, 'updatedAt'),
    });

    return omit(updated, 'password', 'updatedAt');
  }

  @Delete('/:id')
  @Protected('DEVELOPER')
  @ApiOperation({
    summary: 'Delete user by ID',
    description:
      'Deletes a user by ID. Developers cannot delete ADMIN users or their own accounts.',
  })
  @ApiParam({ name: 'id', type: Number, description: 'The user ID.' })
  @ApiResponse({
    status: 204,
    description: 'User deleted successfully.',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden due to role, ownership, or SYSTEM protection.',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found.',
  })
  @HttpCode(204)
  async delete(
    @Req() req: Request,
    @Auth() auth: AuthContext,
    @Param('id') id: number,
  ) {
    const { result: user } = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) throw new NotFoundException('User not found.');

    if (user.role === 'SYSTEM') {
      throw new ForbiddenException('SYSTEM users cannot be deleted.');
    }

    if (auth.user.id === id) {
      throw new ForbiddenException('You cannot delete your own account.');
    }

    if (auth.user.role === 'DEVELOPER' && user.role === 'ADMIN') {
      throw new ForbiddenException('DEVELOPERS cannot delete ADMIN users.');
    }

    await this.prisma.user.delete({ where: { id } });

    await this.activityService.recordActivity({
      req,
      userId: auth.user.id,
      action: 'DELETE',
      resource: 'USER',
      resourceId: id,
      data: omit(user, 'updatedAt'),
    });
  }
}
