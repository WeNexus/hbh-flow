import { ScheduleCreateInputSchema } from './schedule-create-input.schema';
import { ApiProperty } from '@nestjs/swagger';

export class ScheduleSchema extends ScheduleCreateInputSchema {
  @ApiProperty({
    description: 'A unique numeric identifier for the schedule.',
    example: 101,
  })
  id: number;

  @ApiProperty({
    description: 'Indicates whether the schedule is currently active.',
    example: true,
  })
  active: boolean;

  @ApiProperty({
    description:
      'Indicates whether the schedule is dangling, meaning it is not linked to any workflow.',
    example: false,
  })
  dangling: boolean;

  @ApiProperty({
    description: 'Specifies whether the schedule was created by the user.',
    default: true,
    example: true,
  })
  userDefined: boolean;

  @ApiProperty({
    description: 'The date and time when the schedule was created.',
    format: 'date-time',
    example: '2023-10-01T12:00:00Z',
  })
  createdAt: Date;

  @ApiProperty({
    description:
      'The date and time when the schedule was last updated. May be null if never updated.',
    format: 'date-time',
    example: '2023-10-01T12:00:00Z',
  })
  updatedAt: Date | null;
}
