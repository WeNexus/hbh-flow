import type { JsonValue } from '@prisma/client/runtime/library';
import { JobStep, JobStepStatus } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class StepSchema implements Omit<JobStep, 'jobId'> {
  @ApiProperty({
    description: 'The name of the step within the job process.',
    example: 'Fetch Customer Data',
  })
  name: string;

  @ApiProperty({
    description:
      'The result of the step execution. Can be any valid JSON object or null if not executed.',
    example: { status: 'success', recordsFetched: 120 },
  })
  result: JsonValue | null;

  @ApiProperty({
    description: 'The current status of the step execution.',
    enum: JobStepStatus,
    example: JobStepStatus.SUCCEEDED,
  })
  status: JobStepStatus;

  @ApiProperty({
    description: 'The number of times the step has been retried after failure.',
    example: 2,
  })
  retries: number;

  @ApiProperty({
    description:
      'The total number of times this step has been executed, including retries.',
    example: 3,
  })
  runs: number;

  @ApiProperty({
    description: 'The date and time when the step was initially created.',
    format: 'date-time',
    example: '2024-10-01T12:00:00Z',
  })
  createdAt: Date;

  @ApiProperty({
    description:
      'The date and time when the step was last updated. May be null if never updated.',
    format: 'date-time',
    nullable: true,
    example: '2024-10-01T14:30:00Z',
  })
  updatedAt: Date | null;
}
