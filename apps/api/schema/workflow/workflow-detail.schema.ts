import { StepInfoSchema, WorkflowConfigSchema } from '#lib/workflow/schema';
import { WorkflowSchema } from './workflow.schema';
import { ApiProperty } from '@nestjs/swagger';

export class WorkflowDetailSchema extends WorkflowSchema {
  @ApiProperty({
    description: 'The human-readable name of the workflow.',
    example: 'Sync Orders from Shopify',
  })
  name: string;

  @ApiProperty({
    description: 'Indicates whether the workflow queue is currently paused.',
    example: false,
  })
  paused: boolean;

  @ApiProperty({
    description:
      'The number of jobs currently running (in active state) for this workflow.',
    example: 3,
  })
  activeCount: number;

  @ApiProperty({
    description: 'The number of jobs queued and waiting to be processed.',
    example: 7,
  })
  waitingCount: number;

  @ApiProperty({
    description:
      'The total number of jobs that have ever been created for this workflow.',
    example: 120,
  })
  count: number;

  @ApiProperty({
    description: 'The total number of jobs that have failed for this workflow.',
    example: 8,
  })
  failedCount: number;

  @ApiProperty({
    description:
      'The total number of jobs that have successfully completed for this workflow.',
    example: 110,
  })
  completedCount: number;

  @ApiProperty({
    description: 'Configuration options for the workflow.',
    type: WorkflowConfigSchema,
    required: false,
    example: {
      retryLimit: 3,
      timeoutSeconds: 60,
    },
  })
  config?: WorkflowConfigSchema;

  @ApiProperty({
    description:
      'An ordered list of step definitions that make up the workflow.',
    type: [StepInfoSchema],
    example: [
      {
        name: 'fetchOrders',
        description: 'Fetches orders from the external source.',
        retryable: true,
      },
      {
        name: 'processOrders',
        description: 'Processes and saves orders to the database.',
        retryable: false,
      },
    ],
  })
  steps: StepInfoSchema[];
}
