import { IsOptional, IsPositive, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PaginationSchema {
  @ApiProperty({
    description: 'The page number to retrieve. Must be a positive integer.',
    example: 1,
    required: false,
  })
  @IsOptional()
  @IsPositive()
  page?: number;

  @ApiProperty({
    description:
      'The number of items to return per page. Must be a positive integer and no more than 250.',
    example: 10,
    required: false,
  })
  @IsOptional()
  @IsPositive()
  @Max(250)
  limit?: number;
}
