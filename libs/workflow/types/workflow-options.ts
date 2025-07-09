import { RateLimiterOptions as RateLimiterOptionsBase } from 'bullmq';
import { TriggerMetaSchema } from '../schema/trigger-meta.schema';
import { ApiProperty } from '@nestjs/swagger';

export class RateLimiterOptions implements RateLimiterOptionsBase {
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

export class WorkflowOptions {
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
    description: 'The rate limiter options for the workflow',
    type: RateLimiterOptions,
    required: false,
  })
  limit?: RateLimiterOptions;

  @ApiProperty({
    description: 'The maximum number of retries for the workflow',
    required: false,
    default: 3,
  })
  maxRetries?: number;

  @ApiProperty({
    description: 'The delay in milliseconds before retrying a failed job',
    type: TriggerMetaSchema,
    required: false,
  })
  triggers?: TriggerMetaSchema[];
}
