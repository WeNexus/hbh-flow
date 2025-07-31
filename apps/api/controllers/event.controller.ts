import { ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { ActivityService, PrismaService } from '#lib/core/services';
import { Auth, Protected } from '#lib/auth/decorators';
import { ListInputSchema } from '#lib/core/schema';
import type { AuthContext } from '#lib/auth/types';
import { listData } from '#lib/core/misc';
import { omit } from 'lodash-es';
import express from 'express';

import {
  EventUpdateInputSchema,
  EventListOutputSchema,
  EventSchema,
} from '../schema';

import {
  NotFoundException,
  Controller,
  Query,
  Param,
  Patch,
  Body,
  Req,
  Get,
} from '@nestjs/common';

@Controller('api/events')
export class EventController {
  constructor(
    private readonly activityService: ActivityService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('/')
  @Protected('OBSERVER')
  @ApiOperation({
    summary: 'List all events',
    description: 'Fetch a list of all events available in the system.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved the list of events.',
    type: EventListOutputSchema,
  })
  async list(@Query() input: ListInputSchema): Promise<EventListOutputSchema> {
    return listData(this.prisma, 'event', input, [
      'name',
      'provider',
      'connection',
    ]);
  }

  @Get('/:id')
  @Protected('OBSERVER')
  @ApiOperation({
    summary: 'Get an event by ID',
    description: 'Retrieve details of a specific event by its ID.',
  })
  @ApiParam({
    name: 'id',
    description: 'The ID of the event to retrieve.',
    type: Number,
  })
  @ApiResponse({
    status: 404,
    description: 'The specified event was not found.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved the event.',
    type: EventSchema,
  })
  async single(@Param('id') id: number): Promise<EventSchema> {
    try {
      const { result: event } = await this.prisma.event.findUniqueOrThrow({
        where: { id },
      });

      return event;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      throw new NotFoundException('The requested event does not exist.');
    }
  }

  @Patch('/:id')
  @Protected('DEVELOPER')
  @ApiOperation({
    summary: 'Update an event',
    description: 'Modify the specified event with the given update data.',
  })
  @ApiParam({
    name: 'id',
    description: 'The ID of the event to update.',
    type: Number,
  })
  @ApiResponse({
    status: 404,
    description: 'The specified event was not found.',
  })
  @ApiResponse({
    status: 200,
    description: 'Event updated successfully.',
    type: EventUpdateInputSchema,
  })
  async update(
    @Param('id') id: number,
    @Req() req: express.Request,
    @Auth() auth: AuthContext,
    @Body() input: EventUpdateInputSchema,
  ): Promise<EventSchema> {
    try {
      const { result: event } = await this.prisma.event.findUniqueOrThrow({
        where: { id },
      });

      const { result: updated } = await this.prisma.event.update({
        where: { id },
        data: {
          active: input.active,
        },
      });

      // Record the update activity for auditing purposes
      await this.activityService.recordActivity({
        req,
        userId: auth.user.id,
        resource: 'EVENT',
        resourceId: event.id,
        action: 'UPDATE',
        data: omit(event, 'updatedAt'),
        updated: omit(updated, 'updatedAt'),
      });

      return event;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      throw new NotFoundException(
        'The event you are trying to update was not found.',
      );
    }
  }
}
