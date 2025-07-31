import { TriggerMetaSchema } from '#lib/workflow/schema/trigger-meta.schema';
import { RateLimiterOptions as RateLimiterOptionsBase } from 'bullmq';
import { ApiProperty } from '@nestjs/swagger';

export class RateLimiterSchema implements RateLimiterOptionsBase {
  @ApiProperty({
    description:
      'The maximum number of jobs that can be processed per interval',
  })
  max: number;

  @ApiProperty({
    description: 'The time interval in milliseconds for the rate limiter',
  })
  duration: number;
}

export class WorkflowConfigSchema {
  @ApiProperty({
    description: 'The name of the workflow',
    required: false,
  })
  key?: string; // In case the class is renamed, this should be kept as is

  @ApiProperty({
    description: 'The concurrency limit for the workflow execution',
    required: false,
    default: Infinity,
  })
  concurrency?: number;

  @ApiProperty({
    description: 'Whether the workflow is internal',
    required: false,
    default: false,
  })
  internal?: boolean;

  @ApiProperty({
    description:
      'Whether user-defined cron schedules are allowed for the workflow',
    required: false,
  })
  allowUserDefinedCron?: boolean;

  @ApiProperty({
    description: 'The rate limiter options for the workflow',
    type: RateLimiterSchema,
    required: false,
  })
  limit?: RateLimiterSchema;

  @ApiProperty({
    description: 'The maximum number of retries for the workflow',
    required: false,
    default: 3,
  })
  maxRetries?: number;

  @ApiProperty({
    description: 'Whether the workflow can be triggered by a webhook',
    required: false,
  })
  webhook?: boolean;

  @ApiProperty({
    description: 'The delay in milliseconds before retrying a failed job',
    type: TriggerMetaSchema,
    required: false,
  })
  triggers?: TriggerMetaSchema[];
}
