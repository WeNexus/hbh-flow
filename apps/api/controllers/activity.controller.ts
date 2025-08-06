import { listData, PrismaWhereExceptionFilter } from '#lib/core/misc';
import { ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { ActivityListOutputSchema, ActivitySchema } from '../schema';
import { ListInputSchema } from '#lib/core/schema';
import { PrismaService } from '#lib/core/services';
import { Protected } from '#lib/auth/decorators';

import {
  NotFoundException,
  Controller,
  UseFilters,
  Query,
  Get,
} from '@nestjs/common';

@Controller('api/activities')
export class ActivityController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('/')
  @Protected('OBSERVER')
  @UseFilters(PrismaWhereExceptionFilter)
  @ApiOperation({
    summary: 'List activities',
    description:
      'Retrieves a paginated list of activities recorded in the system.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved a list of activities.',
    type: ActivityListOutputSchema,
  })
  list(@Query() input: ListInputSchema): Promise<ActivityListOutputSchema> {
    return listData(this.prisma, 'activity', input, [
      'resource',
      'action',
      'subAction',
    ]);
  }

  @Get('/:id')
  @Protected('OBSERVER')
  @ApiOperation({
    summary: 'Get activity by ID',
    description: 'Retrieves a specific activity by its unique identifier.',
  })
  @ApiParam({
    name: 'id',
    description: 'The unique identifier of the activity to retrieve.',
    type: Number,
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved the activity.',
    type: ActivitySchema,
  })
  @ApiResponse({
    status: 404,
    description: 'Activity not found.',
  })
  async single(@Query('id') id: number): Promise<ActivitySchema> {
    try {
      const { result: activity } = await this.prisma.activity.findUniqueOrThrow(
        {
          where: { id },
        },
      );

      return activity;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      throw new NotFoundException(`Activity with ID ${id} not found`);
    }
  }
}
