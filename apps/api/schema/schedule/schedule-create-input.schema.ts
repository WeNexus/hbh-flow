import { IsPositive, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ScheduleCreateInputSchema {
  @ApiProperty({
    description: 'The id of the workflow to which this schedule belongs',
  })
  @IsPositive()
  workflowId: number;

  @ApiProperty({
    description:
      'Cron expression that defines the schedule, e.g., "0 0 * * *" for daily at midnight',
    example: '0 0 * * *',
    required: true,
  })
  @IsNotEmpty()
  cronExpression: string;
}
