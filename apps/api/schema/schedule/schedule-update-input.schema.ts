import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

export class ScheduleUpdateInputSchema {
  @ApiProperty({
    description:
      'Cron expression that defines the schedule, e.g., "0 0 * * *" for daily at midnight',
    example: '0 0 * * *',
    required: false,
  })
  @IsNotEmpty()
  cronExpression?: string;

  @ApiProperty({
    description: 'Whether the schedule is active',
    required: false,
  })
  active?: boolean;
}
