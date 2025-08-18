import { listData, PrismaWhereExceptionFilter } from '#lib/core/misc';
import { ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { ActivityService, PrismaService } from '#lib/core/services';
import { WorkflowService } from '#lib/workflow/workflow.service';
import { Auth, Protected } from '#lib/auth/decorators';
import { ListInputSchema } from '#lib/core/schema';
import type { AuthContext } from '#lib/auth/types';
import express from 'express';

import {
  ScheduleCreateInputSchema,
  ScheduleUpdateInputSchema,
  ScheduleListOutputSchema,
  ScheduleSchema,
} from '../schema';

import {
  BadRequestException,
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

@Controller('api/schedules')
export class ScheduleController {
  constructor(
    private readonly workflowService: WorkflowService,
    private readonly activityService: ActivityService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('/')
  @Protected('OBSERVER')
  @UseFilters(PrismaWhereExceptionFilter)
  @ApiOperation({
    summary: 'List all schedules',
    description: 'Retrieves a paginated list of all registered schedules.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved the list of schedules.',
    type: ScheduleListOutputSchema,
  })
  async list(
    @Query() input: ListInputSchema,
  ): Promise<ScheduleListOutputSchema> {
    return listData(this.prisma, 'schedule', input, ['cronExpression']);
  }

  @Get('/:id')
  @Protected('OBSERVER')
  @ApiOperation({
    summary: 'Get a schedule by ID',
    description: 'Fetches the details of a specific schedule by its ID.',
  })
  @ApiParam({
    name: 'id',
    description: 'The ID of the schedule to retrieve.',
    type: 'number',
  })
  @ApiResponse({
    status: 404,
    description: 'Schedule not found.',
  })
  @ApiResponse({
    status: 200,
    description: 'Schedule retrieved successfully.',
    type: ScheduleSchema,
  })
  async single(@Param('id') id: number): Promise<ScheduleSchema> {
    try {
      const { result: schedule } = await this.prisma.schedule.findUniqueOrThrow(
        {
          where: { id },
        },
      );

      return schedule;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      throw new NotFoundException(`Schedule with ID "${id}" was not found.`);
    }
  }

  @Post('/')
  @Protected('DEVELOPER')
  @ApiOperation({
    summary: 'Create a schedule and generate a JWT token',
    description:
      'Creates a new schedule and generates a JWT token used to authenticate schedule-triggered workflow executions.',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Workflow not found or invalid configuration.',
  })
  @ApiResponse({
    status: 201,
    description: 'Schedule created successfully.',
    type: ScheduleSchema,
  })
  async create(
    @Req() req: express.Request,
    @Auth() auth: AuthContext,
    @Body() input: ScheduleCreateInputSchema,
  ): Promise<ScheduleSchema> {
    const flow = await this.workflowService.resolveClass(input.workflowId);

    if (!flow) {
      throw new BadRequestException('Specified workflow was not found.');
    }

    const config = await this.workflowService.getConfig(flow);

    if (!config?.allowUserDefinedCron) {
      throw new BadRequestException(
        'This workflow does not support user-defined cron schedules.',
      );
    }

    const dbFlow = await this.workflowService.getDBFlow(flow);

    const existingSchedule = await this.prisma.schedule.findFirst({
      where: {
        workflowId: dbFlow.id,
        cronExpression: input.cronExpression,
      },
    });

    if (existingSchedule) {
      throw new BadRequestException(
        'A schedule with the same cron expression already exists for this workflow.',
      );
    }

    const { result: schedule } = await this.prisma.schedule.create({
      data: {
        workflowId: dbFlow.id,
        cronExpression: input.cronExpression,
        userDefined: true,
      },
    });

    // Record activity for creating a schedule
    await this.activityService.recordActivity({
      req,
      userId: auth.user.id,
      resource: 'SCHEDULE',
      resourceId: schedule.id,
      action: 'CREATE',
      updated: schedule,
    });

    return schedule;
  }

  @Patch('/:id')
  @Protected('DEVELOPER')
  @ApiOperation({
    summary: 'Update a schedule',
    description: 'Updates an existing user-defined schedule.',
  })
  @ApiParam({
    name: 'id',
    description: 'The ID of the schedule to update.',
    type: 'number',
  })
  @ApiResponse({
    status: 404,
    description: 'Schedule not found.',
  })
  @ApiResponse({
    status: 200,
    description: 'Schedule updated successfully.',
    type: ScheduleSchema,
  })
  async update(
    @Param('id') id: number,
    @Req() req: express.Request,
    @Auth() auth: AuthContext,
    @Body() input: ScheduleUpdateInputSchema,
  ): Promise<ScheduleSchema> {
    try {
      const { result: schedule } = await this.prisma.schedule.findUniqueOrThrow(
        {
          where: { id },
        },
      );

      if (!schedule.userDefined && input.cronExpression) {
        throw new BadRequestException(
          'Only user-defined schedules can be updated with a cron expression.',
        );
      }

      const { result: updated } = await this.prisma.schedule.update({
        where: { id },
        data: {
          ...input,
          oldCronExpression:
            input.cronExpression &&
            input.cronExpression !== schedule.cronExpression
              ? schedule.cronExpression
              : undefined,
        },
      });

      // Log schedule update
      await this.activityService.recordActivity({
        req,
        userId: auth.user.id,
        resource: 'SCHEDULE',
        resourceId: schedule.id,
        action: 'UPDATE',
        data: schedule,
        updated,
      });

      this.workflowService.setupCronSchedules();

      return schedule;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      throw new NotFoundException(
        `Schedule with ID "${id}" was not found or cannot be updated.`,
      );
    }
  }

  @Delete('/:id')
  @Protected('DEVELOPER')
  @ApiOperation({
    summary: 'Delete a schedule',
    description:
      'Soft-deletes a user-defined schedule by marking it as dangling.',
  })
  @ApiParam({
    name: 'id',
    description: 'The ID of the schedule to delete.',
    type: 'number',
  })
  @ApiResponse({
    status: 404,
    description: 'Schedule not found.',
  })
  @ApiResponse({
    status: 204,
    description: 'Schedule deleted successfully.',
  })
  @HttpCode(204)
  async delete(
    @Param('id') id: number,
    @Req() req: express.Request,
    @Auth() auth: AuthContext,
  ): Promise<void> {
    id = Number(id);

    if (isNaN(id)) {
      throw new NotFoundException(`Schedule with ID "${id}" was not found.`);
    }

    try {
      const { result: schedule } = await this.prisma.schedule.updateMany({
        where: { id, userDefined: true }, // Only allow deletion of user-defined schedules
        data: {
          dangling: true, // Mark as dangling for soft deletion
        },
      });

      // Log the schedule deletion
      await this.activityService.recordActivity({
        req,
        userId: auth.user.id,
        resource: 'SCHEDULE',
        resourceId: id,
        action: 'DELETE',
        data: schedule,
      });

      this.workflowService.setupCronSchedules();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      throw new NotFoundException(
        `Schedule with ID "${id}" was not found or could not be deleted.`,
      );
    }
  }
}
