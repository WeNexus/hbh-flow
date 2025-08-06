import { IsEnum, IsJSON, IsOptional, IsString } from 'class-validator';
import { PaginationSchema } from './pagination.schema';
import { ApiProperty } from '@nestjs/swagger';

export class ListInputSchema extends PaginationSchema {
  @ApiProperty({
    description: 'Search term used to filter results based on relevant fields.',
    type: String,
    example: 'example',
    required: false,
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({
    description:
      'Field name to sort the results by (e.g., "createdAt", "name").',
    example: 'createdAt',
    required: false,
  })
  @IsOptional()
  @IsString()
  sortField?: string;

  @ApiProperty({
    description: 'Sort order direction: ascending (asc) or descending (desc).',
    enum: ['asc', 'desc'],
    example: 'asc',
    required: false,
  })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';

  @ApiProperty({
    description:
      'Advanced filter object to apply Prisma-style filters to the results.',
    example: JSON.stringify({
      category: 'general',
      status: {
        in: ['active', 'inactive'],
      },
    }),
    required: false,
    additionalProperties: true,
    externalDocs: {
      description:
        'Refer to the Prisma documentation for full guidance on filter syntax and capabilities.',
      url: 'https://www.prisma.io/docs/concepts/components/prisma-client/filtering',
    },
  })
  @IsOptional()
  @IsJSON()
  filter?: string;
}
