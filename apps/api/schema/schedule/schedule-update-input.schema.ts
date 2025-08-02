import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional } from 'class-validator';

export class ScheduleUpdateInputSchema {
  @ApiProperty({
    description:
      'A valid cron expression to update the schedule. For example, "0 0 * * *" runs daily at midnight.',
    example: '0 0 * * *',
    required: false,
  })
  @IsOptional()
  @IsNotEmpty()
  cronExpression?: string;

  @ApiProperty({
    description: 'Indicates whether the schedule should be active.',
    example: true,
    required: false,
  })
  @IsOptional()
  active?: boolean;
}
