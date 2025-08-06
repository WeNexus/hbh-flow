import { ApiProperty } from '@nestjs/swagger';

import {
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsString,
  IsInt,
  Min,
} from 'class-validator';

export class ScheduleUpdateInputSchema {
  @ApiProperty({
    description:
      'A valid cron expression to update the schedule. For example, "0 0 * * *" runs daily at midnight.',
    example: '0 0 * * *',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  cronExpression?: string;

  @ApiProperty({
    description: 'Indicates whether the schedule should be active.',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiProperty({
    description: 'How many next runs to skip. Default is 0.',
    example: 1,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  skipNextRun?: number;
}
