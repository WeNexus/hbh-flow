import { listData, PrismaWhereExceptionFilter } from '#lib/core/misc';
import { ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { ActivityService, PrismaService } from '#lib/core/services';
import { Auth, Protected } from '#lib/auth/decorators';
import { ListInputSchema } from '#lib/core/schema';
import type { AuthContext } from '#lib/auth/types';
import { omit } from 'lodash-es';
import express from 'express';

import {
  FolderCreateInputSchema,
  FolderUpdateInputSchema,
  FolderListOutputSchema,
  FolderSchema,
} from '../schema';

import {
  NotFoundException,
  Controller,
  UseFilters,
  HttpCode,
  Delete,
  Query,
  Param,
  Patch,
  Body,
  Post,
  Req,
  Get,
} from '@nestjs/common';

@Controller('api/folders')
export class FolderController {
  constructor(
    private readonly activityService: ActivityService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('/')
  @Protected('OBSERVER')
  @UseFilters(PrismaWhereExceptionFilter)
  @ApiOperation({
    summary: 'List all folders',
    description: 'Fetches a list of all folders in the system.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved the list of folders.',
    type: FolderListOutputSchema,
  })
  async list(@Query() input: ListInputSchema): Promise<FolderListOutputSchema> {
    return listData(this.prisma, 'folder', input, ['name', 'description']);
  }

  @Get('/:id')
  @Protected('OBSERVER')
  @ApiOperation({
    summary: 'Get a folder by ID',
    description: 'Retrieves details of a specific folder using its ID.',
  })
  @ApiParam({
    name: 'id',
    description: 'The ID of the folder to retrieve.',
    type: Number,
  })
  @ApiResponse({
    status: 404,
    description: 'Folder not found.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved the folder.',
    type: FolderSchema,
  })
  async single(@Param('id') id: number): Promise<FolderSchema> {
    try {
      const { result: folder } = await this.prisma.folder.findUniqueOrThrow({
        where: { id },
      });

      return folder;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      throw new NotFoundException('The requested folder was not found.');
    }
  }

  @Post('/')
  @Protected('DEVELOPER')
  @ApiOperation({
    summary: 'Create a folder',
    description: 'Creates a new folder with the provided data.',
  })
  @ApiResponse({
    status: 201,
    description: 'Folder created successfully.',
    type: FolderSchema,
  })
  async create(
    @Req() req: express.Request,
    @Auth() auth: AuthContext,
    @Body() input: FolderCreateInputSchema,
  ): Promise<FolderSchema> {
    const { result: folder } = await this.prisma.folder.create({
      data: input,
    });

    // Record the creation activity
    await this.activityService.recordActivity({
      req,
      userId: auth.user.id,
      resource: 'FOLDER',
      resourceId: folder.id,
      action: 'CREATE',
      updated: omit(folder, 'updatedAt'),
    });

    return folder;
  }

  @Patch('/:id')
  @Protected('DEVELOPER')
  @ApiOperation({
    summary: 'Update a folder',
    description: 'Updates an existing folder using the provided data.',
  })
  @ApiParam({
    name: 'id',
    description: 'The ID of the folder to update.',
    type: Number,
  })
  @ApiResponse({
    status: 404,
    description: 'Folder not found.',
  })
  @ApiResponse({
    status: 200,
    description: 'Folder updated successfully.',
    type: FolderSchema,
  })
  async update(
    @Param('id') id: number,
    @Req() req: express.Request,
    @Auth() auth: AuthContext,
    @Body() input: FolderUpdateInputSchema,
  ): Promise<FolderSchema> {
    try {
      const { result: folder } = await this.prisma.folder.findUniqueOrThrow({
        where: { id },
      });

      const { result: updated } = await this.prisma.folder.update({
        where: { id },
        data: input,
      });

      // Record the update activity
      await this.activityService.recordActivity({
        req,
        userId: auth.user.id,
        resource: 'FOLDER',
        resourceId: folder.id,
        action: 'UPDATE',
        data: omit(folder, 'updatedAt'),
        updated: omit(updated, 'updatedAt'),
      });

      return folder;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      throw new NotFoundException(
        'The folder you are trying to update was not found.',
      );
    }
  }

  @Delete('/:id')
  @Protected('DEVELOPER')
  @ApiOperation({
    summary: 'Delete a folder',
    description: 'Deletes a folder by its ID.',
  })
  @ApiParam({
    name: 'id',
    description: 'The ID of the folder to delete.',
    type: Number,
  })
  @ApiResponse({
    status: 404,
    description: 'Folder not found.',
  })
  @ApiResponse({
    status: 204,
    description: 'Folder deleted successfully.',
  })
  @HttpCode(204)
  async delete(
    @Param('id') id: number,
    @Req() req: express.Request,
    @Auth() auth: AuthContext,
  ): Promise<void> {
    try {
      const { result: folder } = await this.prisma.folder.delete({
        where: { id },
      });

      // Record the delete activity
      await this.activityService.recordActivity({
        req,
        userId: auth.user.id,
        resource: 'FOLDER',
        resourceId: id,
        action: 'DELETE',
        data: omit(folder, 'updatedAt'),
      });
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      throw new NotFoundException(
        'The folder you are trying to delete was not found.',
      );
    }
  }
}
