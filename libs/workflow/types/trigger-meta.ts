import { type Timezone, timezones } from './timezone.js';
import { ApiProperty } from '@nestjs/swagger';

export enum TriggerType {
  Webhook = 'Webhook',
  Cron = 'Cron',
  Event = 'Event',
}

export class TriggerMeta {
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
      'There could multiple instance of the same service, it specifies the source.',
    required: false,
  })
  eventSource?: string;

  @ApiProperty({
    description:
      'Cron expression for scheduling the workflow. This is used for Cron triggers.',
    required: false,
    example: '0 0 * * *', // Every day at midnight
  })
  pattern?: string;

  oldPattern?: string; // Old cron expression for scheduling, used for updating existing schedules
  oldName?: string; // Old name of the workflow, used for updating existing schedules
  immediate?: boolean; // If true, the job will be executed immediately after it is created.

  @ApiProperty({
    description:
      'The timezone for the cron job. If not provided, defaults to UTC.',
    required: false,
    enum: timezones,
  })
  timezone?: Timezone; // Timezone for the cron job
}
