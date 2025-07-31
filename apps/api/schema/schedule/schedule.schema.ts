import { ScheduleCreateInputSchema } from './schedule-create-input.schema';
import { ApiProperty } from '@nestjs/swagger';

export class ScheduleSchema extends ScheduleCreateInputSchema {
  @ApiProperty({
    description: 'Unique identifier for the schedule',
  })
  id: number;

  @ApiProperty({
    description: 'Whether the schedule is active',
  })
  active: boolean;

  @ApiProperty({
    description:
      'Whether the schedule is dangling (not linked to any workflow)',
  })
  dangling: boolean;

  @ApiProperty({
    description: 'Whether the schedule is user-defined',
    default: true,
  })
  userDefined: boolean;

  @ApiProperty({
    description: 'Created at timestamp',
    format: 'date-time',
    example: '2023-10-01T12:00:00Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Updated at timestamp',
    format: 'date-time',
    example: '2023-10-01T12:00:00Z',
  })
  updatedAt: Date | null;
}
