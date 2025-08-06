import { listData, PrismaWhereExceptionFilter } from '#lib/core/misc';
import { ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { ListInputSchema } from '#lib/core/schema';
import { PrismaService } from '#lib/core/services';
import { Protected } from '#lib/auth/decorators';

import {
  RevisionListOutputSchema,
  RevisionDetailSchema,
  RevisionSchema,
} from '../schema';

import {
  NotFoundException,
  Controller,
  UseFilters,
  Query,
  Get,
} from '@nestjs/common';

@Controller('api/revisions')
export class RevisionController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('/')
  @Protected('OBSERVER')
  @UseFilters(PrismaWhereExceptionFilter)
  @ApiOperation({
    summary: 'List revisions',
    description: 'Retrieves a paginated list of revisions.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved a list of revisions.',
    type: RevisionListOutputSchema,
  })
  async list(
    @Query() input: ListInputSchema,
  ): Promise<RevisionListOutputSchema> {
    const output = await listData(
      this.prisma,
      'revision',
      input,
      ['resource', 'action'],
      {
        include: {
          Activity: {
            select: {
              userId: true,
            },
          },
        },
      },
    );

    for (const r of output.data) {
      (r as Record<string, any>).userId = r.Activity.userId;
      delete (r as Record<string, any>).Activity;
    }

    return output as unknown as RevisionListOutputSchema;
  }

  @Get('/:id')
  @Protected('OBSERVER')
  @ApiOperation({
    summary: 'Get revision by ID',
    description: 'Retrieve a specific revision by its unique identifier.',
  })
  @ApiParam({
    name: 'id',
    description: 'The unique identifier of the revision to retrieve.',
    type: Number,
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved the revision.',
    type: RevisionSchema,
  })
  @ApiResponse({
    status: 404,
    description: 'Revision not found.',
  })
  async single(@Query('id') id: number): Promise<RevisionDetailSchema> {
    try {
      const { result: revision } = await this.prisma.revision.findUniqueOrThrow(
        {
          where: { id },
          include: {
            Activity: true,
          },
        },
      );

      (revision as Record<string, any>).userId = revision.Activity.userId;

      return revision as unknown as RevisionDetailSchema;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      throw new NotFoundException(`Revision with ID ${id} not found`);
    }
  }
}
