import { type Timezone, timezones } from '#lib/workflow/types/timezone.js';
import { TriggerType } from '#lib/workflow/misc/trigger-type.enum.js';
import { ApiProperty } from '@nestjs/swagger';

export class TriggerMetaSchema {
  @ApiProperty({ enum: TriggerType })
  type: TriggerType;

  @ApiProperty({
    description:
      'Event name that triggers the workflow. Can be a single event or an array of events.',
    required: false,
    oneOf: [
      {
        type: 'string',
      },
      {
        type: 'array',
        items: {
          type: 'string',
        },
      },
    ],
  })
  event?: string | string[];

  @ApiProperty({
    description:
      'Provider name for the event trigger. This is useful when you have multiple providers for the same event.',
    required: false,
  })
  provider?: string;

  @ApiProperty({
    description:
      'Connection name to use for the event trigger. This is useful when you have multiple connections to the same provider.',
    required: false,
  })
  connection?: string;

  @ApiProperty({
    description:
      'Cron expression for scheduling the workflow. This is used for Cron triggers.',
    required: false,
    example: '0 0 * * *', // Every day at midnight
  })
  pattern?: string;

  oldPattern?: string; // Old cron expression for scheduling, used for updating existing schedules
  immediate?: boolean; // If true, the job will be executed immediately after it is created.

  @ApiProperty({
    description:
      'The timezone for the cron job. If not provided, defaults to UTC.',
    required: false,
    enum: timezones,
  })
  timezone?: Timezone; // Timezone for the cron job
}
