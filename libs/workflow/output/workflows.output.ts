import { WorkflowOptions } from '../types/workflow-options.js';
import { StepInfo } from '../types/step-info.js';
import { ApiProperty } from '@nestjs/swagger';

export class WorkflowsOutput extends WorkflowOptions {
  @ApiProperty({
    description: 'The name of the workflow',
    example: 'exampleWorkflow',
  })
  name: string;

  @ApiProperty({
    description: 'The steps of the workflow',
    type: StepInfo,
  })
  steps: StepInfo[];

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
