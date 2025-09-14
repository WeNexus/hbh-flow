import { ApiProperty } from '@nestjs/swagger';

export class DayAndCount {
  @ApiProperty({
    description: 'The day of the executions',
    required: true,
    example: '2023-01-01T00:00:00.000Z',
    format: 'date-time',
  })
  date: string;

  @ApiProperty({
    description: 'The number of executions on this day',
    required: true,
    example: 123,
  })
  count: string | number;
}

export class DayAndCountWithDuration extends DayAndCount {
  @ApiProperty({
    description:
      'The average duration of executions on this day in milliseconds',
    required: true,
    example: 4567,
  })
  averageDuration: string;
}

export class Workflow {
  @ApiProperty({
    description: 'The ID of the workflow',
    required: true,
    example: '1',
  })
  id: string;

  @ApiProperty({
    description: 'The name of the workflow',
    required: true,
    example: 'My Workflow',
  })
  name: string;

  @ApiProperty({
    description: 'The number of executions for this workflow',
    required: true,
    example: 123,
  })
  count: number | string;

  @ApiProperty({
    description: 'Whether the workflow is active',
    required: true,
    example: true,
  })
  active: boolean;

  @ApiProperty({
    description:
      'The average duration of executions for this workflow in milliseconds',
    required: true,
    example: 4567,
  })
  averageDuration: number | string;

  @ApiProperty({
    description: 'The daily counts of executions for this workflow',
    required: true,
    type: [DayAndCount],
  })
  dailyCounts: DayAndCountWithDuration[];
}

export class ByStatusDay {
  @ApiProperty({
    description: 'Executions that succeeded in the last 30 days grouped by day',
    required: false,
    type: [DayAndCount],
  })
  SUCCEEDED?: DayAndCount[];

  @ApiProperty({
    description: 'Executions that failed in the last 30 days grouped by day',
    required: false,
    type: [DayAndCount],
  })
  FAILED?: DayAndCount[];
}

export class Last6MonthsByStatusMonth {
  @ApiProperty({
    description:
      'Executions that succeeded in the last 6 months grouped by month',
    required: false,
    type: [DayAndCount],
  })
  SUCCEEDED?: DayAndCount[];

  @ApiProperty({
    description: 'Executions that failed in the last 6 months grouped by month',
    required: false,
    type: [DayAndCount],
  })
  FAILED?: DayAndCount[];
}

export class ByTriggerDay {
  @ApiProperty({
    description:
      'Executions triggered by webhook in the last 30 days grouped by day',
    required: false,
    type: [DayAndCount],
  })
  WEBHOOK?: DayAndCount[];

  @ApiProperty({
    description:
      'Executions triggered by schedule in the last 30 days grouped by day',
    required: false,
    type: [DayAndCount],
  })
  SCHEDULE?: DayAndCount[];

  @ApiProperty({
    description:
      'Executions triggered manually in the last 30 days grouped by day',
    required: false,
    type: [DayAndCount],
  })
  MANUAL?: DayAndCount[];

  @ApiProperty({
    description:
      'Executions triggered by event in the last 30 days grouped by day',
    required: false,
    type: [DayAndCount],
  })
  EVENT?: DayAndCount[];
}

export class ExecutionsSchema {
  @ApiProperty({
    description: 'Total number of executions ever',
    required: true,
    example: 12345,
  })
  total: number | string;

  @ApiProperty({
    description: 'Executions grouped by workflow',
    required: true,
    type: [Workflow],
  })
  workflows: Workflow[];

  @ApiProperty({
    description: 'Executions in the last 30 days grouped by day and status',
    required: true,
    example: {
      SUCCEEDED: [
        { day: '2023-01-01T00:00:00.000Z', count: 100 },
        { day: '2023-01-02T00:00:00.000Z', count: 150 },
      ],
      FAILED: [
        { day: '2023-01-01T00:00:00.000Z', count: 10 },
        { day: '2023-01-02T00:00:00.000Z', count: 5 },
      ],
    },
    type: [DayAndCount],
  })
  byDay: DayAndCount[];

  @ApiProperty({
    description: 'Executions in the last 30 days grouped by status and day',
    required: true,
    type: ByStatusDay,
  })
  byStatusDay: ByStatusDay;

  @ApiProperty({
    description: 'Executions in the last 30 days grouped by trigger and day',
    required: true,
    type: ByTriggerDay,
  })
  byTriggerDay: ByTriggerDay;

  @ApiProperty({
    description: 'Executions in the last 6 months grouped by status and month',
    required: true,
    type: Last6MonthsByStatusMonth,
  })
  byStatusMonth: Last6MonthsByStatusMonth;
}
