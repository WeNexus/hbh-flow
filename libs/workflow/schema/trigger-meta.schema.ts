import { type Timezone, timezones } from '#lib/workflow/types/timezone.js';
import { TriggerType } from '#lib/workflow/misc/trigger-type.enum.js';
import { ApiProperty } from '@nestjs/swagger';

export class TriggerMetaSchema {
  @ApiProperty({
    description:
      'The type of trigger used to initiate the workflow (e.g., Event, Cron).',
    enum: TriggerType,
    example: TriggerType.Event,
  })
  type: TriggerType;

  @ApiProperty({
    description:
      'The event name(s) that trigger the workflow. Can be a string or an array of strings.',
    required: false,
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: ['order.created', 'order.updated'],
  })
  event?: string | string[];

  @ApiProperty({
    description:
      'The provider name associated with the event trigger. Useful when multiple providers emit similar events.',
    required: false,
    example: 'shopify',
  })
  provider?: string;

  @ApiProperty({
    description:
      'The connection identifier to use for the trigger. Helps distinguish between multiple connections to the same provider.',
    required: false,
    example: 'shopify-main-store',
  })
  connection?: string;

  @ApiProperty({
    description:
      'Cron expression used to schedule workflow execution. Applicable only for CRON triggers.',
    required: false,
    example: '0 0 * * *', // Every day at midnight
  })
  pattern?: string;

  // Internal fields not exposed via Swagger
  oldPattern?: string;

  immediate?: boolean;

  @ApiProperty({
    description:
      'The timezone used for the cron schedule. Defaults to UTC if not specified.',
    enum: timezones,
    required: false,
    example: 'America/New_York',
  })
  timezone?: Timezone;
}
