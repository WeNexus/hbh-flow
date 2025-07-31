import { StepInfoSchema, WorkflowConfigSchema } from '#lib/workflow/schema';
import { WorkflowSchema } from './workflow.schema';
import { ApiProperty } from '@nestjs/swagger';

export class WorkflowDetailSchema extends WorkflowSchema {
  @ApiProperty({
    description: 'The name of the workflow',
    example: 'exampleWorkflow',
  })
  name: string;

  @ApiProperty({
    description: 'Indicates whether the workflow queue is paused',
  })
  paused: boolean;

  @ApiProperty({
    description: 'The number of currently active jobs',
  })
  activeCount: number;

  @ApiProperty({
    description: 'The number of jobs waiting to be processed',
  })
  waitingCount: number;

  @ApiProperty({
    description: 'Total number of jobs ever created for this workflow',
  })
  count: number;

  @ApiProperty({
    description: 'The number of jobs failed for this workflow',
  })
  failedCount: number;

  @ApiProperty({
    description: 'The number of jobs completed for this workflow',
  })
  completedCount: number;

  @ApiProperty({
    description: 'Workflow options',
    type: WorkflowConfigSchema,
    required: false,
  })
  config?: WorkflowConfigSchema;

  @ApiProperty({
    description: 'List of steps in the workflow',
    type: [StepInfoSchema],
  })
  steps: StepInfoSchema[];
}
