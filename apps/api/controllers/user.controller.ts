import { listData, PrismaWhereExceptionFilter } from '#lib/core/misc';
import { ActivityService, PrismaService } from '#lib/core/services';
import { FileInterceptor } from '@nestjs/platform-express';
import { Auth, Protected } from '#lib/auth/decorators';
import { ListInputSchema } from '#lib/core/schema';
import type { AuthContext } from '#lib/auth/types';
import type { Request, Response } from 'express';
import { omit } from 'lodash-es';
import argon2 from 'argon2';
import sharp from 'sharp';

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UseInterceptors,
  UploadedFile,
  Controller,
  UseFilters,
  HttpCode,
  Delete,
  Param,
  Query,
  Patch,
  Body,
  Post,
  Get,
  Req,
  Res,
} from '@nestjs/common';

import {
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiParam,
} from '@nestjs/swagger';

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

  private supportedImageTypes = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/avif',
    'image/tiff',
    'image/svg+xml',
  ]);

  @Get('/')
  @Protected('OBSERVER')
  @UseFilters(PrismaWhereExceptionFilter)
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
  @UseInterceptors(
    FileInterceptor('avatar', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }), // 5MB limit
  )
  async create(
    @Req() req: Request,
    @Body() input: UserCreateInputSchema,
    @Auth() auth: AuthContext,
    @UploadedFile() rawAvatar?: Express.Multer.File,
  ) {
    const { result: existingUser } = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
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
        avatar: await this.processAvatar(rawAvatar),
      },
      omit: { avatar: true },
    });

    await this.activityService.recordActivity({
      req,
      userId: auth.user.id,
      action: 'CREATE',
      resource: 'USER',
      resourceId: user.id,
      updated: user,
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
  @ApiConsumes('multipart/form-data')
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
  @UseInterceptors(
    FileInterceptor('avatar', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }), // 5MB limit
  )
  async update(
    @Req() req: Request,
    @Param('id') id: number,
    @Body() input: UserUpdateInputSchema,
    @Auth() auth: AuthContext,
    @UploadedFile() rawAvatar?: Express.Multer.File,
  ) {
    const { result: user } = await this.prisma.user.findUnique({
      where: { id },
      omit: { avatar: true },
    });

    if (!user) throw new NotFoundException('User not found.');

    const isSelfUpdate = auth.user.id === id;

    if (!auth.isPowerUser && !isSelfUpdate) {
      throw new ForbiddenException(
        'You are not authorized to update this user.',
      );
    }

    if (isSelfUpdate && input.role) {
      throw new ForbiddenException('You cannot change your own role.');
    }

    if (
      !(auth.user.role === 'ADMIN' || auth.user.role === 'SYSTEM') &&
      input.role === 'ADMIN'
    ) {
      throw new ForbiddenException(
        'Only ADMIN or SYSTEM users can assign ADMIN role.',
      );
    }

    const { result: updated } = await this.prisma.user.update({
      where: { id },
      data: {
        ...omit(input, 'avatar'),
        avatar: await this.processAvatar(rawAvatar),
        password: input.password
          ? await argon2.hash(input.password)
          : undefined,
      },
      omit: { avatar: true },
    });

    await this.activityService.recordActivity({
      req,
      userId: auth.user.id,
      action: 'UPDATE',
      resource: 'USER',
      resourceId: id,
      subAction: isSelfUpdate ? 'SELF_UPDATE' : undefined,
      data: user,
      updated,
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
      omit: { avatar: true },
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
      data: user,
    });
  }

  @Get('/:id/avatar')
  @Protected('OBSERVER')
  @ApiOperation({
    summary: 'Get user avatar by ID',
    description: 'Retrieves the avatar of a user by their unique numeric ID.',
  })
  @ApiParam({ name: 'id', type: Number, description: 'The user ID.' })
  @ApiResponse({
    status: 200,
    description: 'User avatar found and returned.',
    content: {
      'image/webp': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async getAvatar(
    @Param('id') id: number,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!id || isNaN(id)) {
      throw new BadRequestException('Invalid user ID provided.');
    }

    const { result: user } = await this.prisma.user.findUnique({
      where: { id },
      select: { avatar: true },
    });

    if (!user?.avatar) {
      throw new NotFoundException('User avatar not found.');
    }

    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Content-Length', user.avatar.length);
    res.setHeader('Cache-Control', 'public, max-age=3600, immutable'); // 1 hour cache
    res.setHeader('Content-Disposition', 'inline; filename="avatar.webp"');

    res.status(200).send(user.avatar);
  }

  private processAvatar(rawAvatar?: Express.Multer.File) {
    if (!rawAvatar) {
      return undefined;
    }

    if (!this.supportedImageTypes.has(rawAvatar.mimetype)) {
      throw new BadRequestException(
        'Unsupported image type. Supported types: JPEG, PNG, WebP, GIF, AVIF, TIFF, SVG.',
      );
    }

    return sharp(rawAvatar.buffer)
      .resize({
        width: 400,
        fit: 'cover',
        withoutEnlargement: true,
      })
      .webp({
        quality: 80,
        nearLossless: true,
        preset: 'photo',
      })
      .toBuffer();
  }
}
