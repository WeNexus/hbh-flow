import { ApiProperty } from '@nestjs/swagger';
import { $Enums, Job } from '@prisma/client';

export class JobSchema
  implements Omit<Job, 'sentryTrace' | 'sentryBaggage' | 'payload' | 'options'>
{
  @ApiProperty({
    description: 'A unique numeric identifier for the job.',
    example: 101,
  })
  id: number;

  @ApiProperty({
    description:
      'The ID of the parent job, if this job is a replay of another job. Optional.',
    example: 100,
  })
  parentId: number | null;

  @ApiProperty({
    description:
      'The internal queue identifier assigned by Bull for this job. Optional.',
    example: '#101',
  })
  bullId: string | null;

  @ApiProperty({
    description: 'A unique string used to identify and deduplicate jobs.',
    example: 'dedupe-abc-xyz',
  })
  dedupeId: string | null;

  @ApiProperty({
    description: 'The ID of the workflow associated with this job.',
    example: 55,
  })
  workflowId: number;

  @ApiProperty({
    description: 'The current status of the job.',
    enum: $Enums.JobStatus,
    example: $Enums.JobStatus.WAITING,
  })
  status: $Enums.JobStatus;

  @ApiProperty({
    description: 'The type of trigger that initiated the job.',
    enum: $Enums.Trigger,
    example: $Enums.Trigger.EVENT,
  })
  trigger: $Enums.Trigger;

  @ApiProperty({
    description: 'The ID of the trigger that initiated the job. Optional.',
    example: 'event_456',
  })
  triggerId: string | null;

  @ApiProperty({
    description: 'The scheduled execution time for the job, if set.',
    format: 'date-time',
    example: '2024-10-01T12:00:00Z',
  })
  scheduledAt: Date | null;

  @ApiProperty({
    description: 'The date and time when the job was created.',
    format: 'date-time',
    example: '2024-09-30T10:30:00Z',
  })
  createdAt: Date;

  @ApiProperty({
    description:
      'The date and time when the job was last updated, if applicable.',
    format: 'date-time',
    example: '2024-10-01T14:45:00Z',
  })
  updatedAt: Date | null;
}
