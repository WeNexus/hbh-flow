import { PaginationSchema } from './pagination.schema';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';

export class ListInputSchema extends PaginationSchema {
  @ApiProperty({
    description: 'Search term to filter results',
    type: String,
    example: 'example',
    required: false,
  })
  @IsOptional()
  search?: string;

  @ApiProperty({
    description: 'Sort field for the results',
    type: String,
    example: 'createdAt',
    required: false,
  })
  @IsOptional()
  sortField?: string;

  @ApiProperty({
    description: 'Sort order for the results',
    type: String,
    enum: ['asc', 'desc'],
    example: 'asc',
    required: false,
  })
  @IsOptional()
  sortOrder?: 'asc' | 'desc';

  @ApiProperty({
    description:
      'Please take a look at the Prisma documentation for more information on how to use filters and sorting.',
    example: {
      category: 'general',
      status: {
        in: ['active', 'inactive'],
      },
    },
    required: false,
    additionalProperties: true,
    externalDocs: {
      description:
        'Additional filter criteria can be specified like Prisma filters.',
      url: 'https://www.prisma.io/docs/concepts/components/prisma-client/filtering',
    },
  })
  @IsOptional()
  filter?: Record<string, any>;
}
