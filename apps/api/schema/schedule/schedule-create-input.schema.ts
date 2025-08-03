import { IsPositive, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ScheduleCreateInputSchema {
  @ApiProperty({
    description:
      'The ID of the workflow that this schedule is associated with.',
    example: 42,
  })
  @IsPositive()
  workflowId: number;

  @ApiProperty({
    description:
      'A valid cron expression that defines when the schedule should run. For example, "0 0 * * *" means daily at midnight.',
    example: '0 0 * * *',
    required: true,
  })
  @IsString()
  @IsNotEmpty()
  cronExpression: string;
}
