import type { JsonValue } from '@prisma/client/runtime/library';
import { JobStep, JobStepStatus } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class StepSchema implements Omit<JobStep, 'jobId'> {
  @ApiProperty({
    description: 'Name of the step',
  })
  name: string;

  @ApiProperty({
    description: 'Result of the step execution',
  })
  result: JsonValue | null;

  @ApiProperty({
    description: 'Status of the step',
    enum: JobStepStatus,
  })
  status: JobStepStatus;

  @ApiProperty({
    description: 'Number of retries the step has undergone',
  })
  retries: number;

  @ApiProperty({
    description: 'Number of times the step has been executed',
  })
  runs: number;

  @ApiProperty({
    description: 'Timestamp when the step was created',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Timestamp when the step was last updated',
    nullable: true,
  })
  updatedAt: Date | null;
}
