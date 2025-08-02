import { ApiProperty } from '@nestjs/swagger';

export abstract class ListOutputSchema<D = any> {
  /**
   * An array containing the items returned in the current page.
   * This field must be implemented in subclasses with appropriate typing.
   */
  abstract data: D;

  @ApiProperty({
    description: 'The total number of items that match the query/filter.',
    example: 100,
  })
  count: number;

  @ApiProperty({
    description:
      'Total number of pages available based on item count and limit.',
    example: 10,
  })
  pages: number;

  @ApiProperty({
    description: 'The current page number being returned.',
    example: 1,
  })
  page: number;

  @ApiProperty({
    description: 'The number of items returned per page.',
    example: 10,
  })
  limit: number;

  @ApiProperty({
    description: 'Indicates whether there is a next page of results.',
    example: true,
  })
  hasNext: boolean;

  @ApiProperty({
    description: 'Indicates whether there is a previous page of results.',
    type: Boolean,
    example: false,
  })
  hasPrev: boolean;
}
