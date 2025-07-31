import { ApiProperty } from '@nestjs/swagger';

export abstract class ListOutputSchema<D = any> {
  abstract data: D; // Array of items in the list

  @ApiProperty({
    description: 'Total number of items in the list',
    type: Number,
    example: 100,
  })
  count: number;

  @ApiProperty({
    description: 'Total number of pages available',
    type: Number,
    example: 10,
  })
  pages: number;

  @ApiProperty({
    description: 'Current page number',
    type: Number,
    example: 1,
  })
  page: number;

  @ApiProperty({
    description: 'Number of items per page',
    type: Number,
    example: 10,
  })
  limit: number;

  @ApiProperty({
    description: 'Indicates if there are more items available on the next page',
    type: Boolean,
    example: false,
  })
  hasNext: boolean;

  @ApiProperty({
    description: 'Indicates if there are items available on the previous page',
    type: Boolean,
    example: false,
  })
  hasPrev: boolean;
}
