import type { JsonValue } from '@prisma/client/runtime/library';
import { JobStepStatus } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { JobSchema } from './job.schema';

export class JobStepSchema {
  @ApiProperty({
    description: 'The name of the job step.',
    example: 'data_sync',
  })
  name: string;

  @ApiProperty({
    description: 'The result of the job step, if any.',
    example: { imported: 100, errors: 0 },
    required: false,
  })
  result?: JsonValue;

  @ApiProperty({
    description: 'The resume data for the job step, if any.',
    example: { download_url: 'https://example.com/file.zip' },
    required: false,
  })
  resume?: JsonValue;

  @ApiProperty({
    description: 'The status of the job step.',
    example: 'COMPLETED',
    enum: JobStepStatus,
  })
  status: JobStepStatus;

  @ApiProperty({
    description: 'The number of retries for the job step.',
    example: 2,
  })
  retries: number;

  @ApiProperty({
    description: 'The number of times the job step has been executed.',
    example: 1,
  })
  runs: number;

  @ApiProperty({
    description: 'The date and time when the job step was created.',
    example: '2023-10-01T12:00:00Z',
    format: 'date-time',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'The date and time when the job step was last updated.',
    example: '2023-10-01T12:00:00Z',
    format: 'date-time',
    required: false,
  })
  updatedAt: Date | null;
}

export class JobDetailSchema extends JobSchema {
  @ApiProperty({
    description: 'The payload data passed to the job at runtime.',
    example: {
      userId: 123,
      action: 'sync_data',
    },
  })
  payload: JsonValue;

  // Steps
  @ApiProperty({
    description: 'The steps executed by the job.',
    example: [
      {
        name: 'data_sync',
        result: { imported: 100, errors: 0 },
        resume: { download_url: 'https://example.com/file.zip' },
        status: 'COMPLETED',
        retries: 1,
        runs: 2,
        createdAt: '2023-10-01T12:00:00Z',
        updatedAt: '2023-10-01T12:30:00Z',
      },
    ],
    type: [JobStepSchema],
  })
  Steps: JobStepSchema[];
}
