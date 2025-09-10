import { StepInfoSchema, WorkflowConfigSchema } from '#lib/workflow/schema';
import { WorkflowSchema } from './workflow.schema';
import { ApiProperty } from '@nestjs/swagger';

export class WorkflowDetailSchema extends WorkflowSchema {
  @ApiProperty({
    description: 'Indicates whether the workflow queue is currently paused.',
    example: false,
  })
  paused: boolean;

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
