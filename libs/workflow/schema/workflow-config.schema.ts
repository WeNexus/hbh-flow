import { TriggerMetaSchema } from '#lib/workflow/schema/trigger-meta.schema';
import { RateLimiterOptions as RateLimiterOptionsBase } from 'bullmq';
import { ApiProperty } from '@nestjs/swagger';

export class RateLimiterSchema implements RateLimiterOptionsBase {
  @ApiProperty({
    description:
      'The maximum number of jobs that can be processed within the specified duration.',
    example: 100,
  })
  max: number;

  @ApiProperty({
    description:
      'The time interval (in milliseconds) used to enforce the rate limit.',
    example: 60000, // 1 minute
  })
  duration: number;
}

export class WorkflowConfigSchema {
  @ApiProperty({
    description: 'A unique key used to identify the workflow programmatically.',
    required: false,
    example: 'sync_shopify_orders',
  })
  key?: string;

  @ApiProperty({
    description:
      'A human-readable name for the workflow, used for display purposes.',
    required: true,
    example: 'Sync Shopify Orders',
  })
  name?: string;

  @ApiProperty({
    description:
      'The maximum number of jobs that can run concurrently in the workflow.',
    required: false,
    default: Infinity,
    example: 5,
  })
  concurrency?: number;

  @ApiProperty({
    description:
      'Marks the workflow as internal-only, restricting external access.',
    required: false,
    default: false,
    example: false,
  })
  internal?: boolean;

  @ApiProperty({
    description:
      'Allows users to define custom cron schedules for the workflow.',
    required: false,
    example: true,
  })
  allowUserDefinedCron?: boolean;

  @ApiProperty({
    description: 'Configuration for rate limiting the workflow execution.',
    type: RateLimiterSchema,
    required: false,
  })
  limit?: RateLimiterSchema;

  @ApiProperty({
    description:
      'The maximum number of retry attempts for failed jobs in the workflow.',
    required: false,
    default: 3,
    example: 3,
  })
  maxRetries?: number;

  @ApiProperty({
    description:
      'Specifies whether the workflow can be triggered by a webhook event.',
    required: false,
    example: true,
  })
  webhook?: boolean;

  @ApiProperty({
    description:
      'An array of trigger definitions that initiate the workflow (event-based or cron-based).',
    type: [TriggerMetaSchema],
    required: false,
    example: [
      {
        type: 'Event',
        event: 'order.created',
        provider: 'shopify',
        connection: 'store-1',
      },
      {
        type: 'Cron',
        pattern: '0 0 * * *',
        timezone: 'UTC',
      },
    ],
  })
  triggers?: TriggerMetaSchema[];
}
