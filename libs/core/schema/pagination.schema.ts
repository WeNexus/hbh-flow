import { IsOptional, IsPositive, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PaginationSchema {
  @ApiProperty({
    description: 'Page number for pagination',
    type: Number,
    example: 1,
    required: false,
  })
  @IsOptional()
  @IsPositive()
  page?: number;

  @ApiProperty({
    description: 'Number of items per page',
    type: Number,
    example: 10,
    required: false,
  })
  @IsPositive()
  @Max(250)
  @IsOptional()
  limit?: number;
}
