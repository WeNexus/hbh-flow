import type { JsonValue } from '@prisma/client/runtime/library';
import { ApiProperty } from '@nestjs/swagger';
import { $Enums, Job } from '@prisma/client';

export class JobSchema implements Omit<Job, 'sentryTrace' | 'sentryBaggage'> {
  @ApiProperty({ description: 'Unique identifier for the job' })
  id: number;

  @ApiProperty({ description: 'Parent job ID, if any' })
  parentId: number | null;

  @ApiProperty({ description: 'Unique identifier for the job in the queue' })
  bullId: string | null;

  @ApiProperty({ description: 'Unique identifier for deduplication purposes' })
  dedupeId: string | null;

  @ApiProperty({ description: 'Workflow ID associated with the job' })
  workflowId: number;

  @ApiProperty({
    description: 'Status of the job',
    enum: $Enums.JobStatus,
  })
  status: $Enums.JobStatus;

  @ApiProperty({
    description: 'Trigger type of the job',
    enum: $Enums.Trigger,
  })
  trigger: $Enums.Trigger;

  @ApiProperty({ description: 'ID of the trigger that initiated the job' })
  triggerId: string | null;

  @ApiProperty({
    description: 'Date and time when the job is scheduled to run',
    format: 'date-time',
  })
  scheduledAt: Date | null;

  @ApiProperty({
    description: 'Payload data for the job',
  })
  payload: JsonValue;

  @ApiProperty({
    description: 'Date and time when the job was created',
    format: 'date-time',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Date and time when the job was last updated',
    format: 'date-time',
  })
  updatedAt: Date | null;
}
