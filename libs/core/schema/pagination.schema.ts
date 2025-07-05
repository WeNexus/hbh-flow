import { ApiProperty } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';

export class PaginationSchema {
  @ApiProperty({
    description: 'Number of items per page',
    type: Number,
    example: 10,
    required: false,
  })
  @IsOptional()
  page?: number;

  @ApiProperty({
    description: 'Page number for pagination',
    type: Number,
    example: 1,
    required: false,
  })
  @IsOptional()
  limit?: number;
}
