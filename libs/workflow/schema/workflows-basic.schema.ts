import { WorkflowOptions } from '#lib/workflow/types/workflow-options.js';
import { StepInfoSchema } from './step-info.schema.js';
import { ApiProperty } from '@nestjs/swagger';

export class WorkflowsBasicSchema extends WorkflowOptions {
  @ApiProperty({
    description: 'The name of the workflow',
    example: 'exampleWorkflow',
  })
  name: string;

  @ApiProperty({
    description: 'The steps of the workflow',
    type: StepInfoSchema,
  })
  steps: StepInfoSchema[];

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
    description: 'The number of jobs that have failed',
  })
  failingCount: number;
}
