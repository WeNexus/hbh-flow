import { WorkflowBasicSchema } from './workflow-basic.schema';
import { ApiProperty } from '@nestjs/swagger';

export class WorkflowSchema extends WorkflowBasicSchema {
  @ApiProperty({
    description:
      'The total number of jobs that have ever been created for this workflow.',
    example: 120,
  })
  count: number;

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
}
