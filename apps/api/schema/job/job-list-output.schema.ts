import { ListOutputSchema } from '#lib/core/schema';
import { ApiProperty } from '@nestjs/swagger';
import { JobSchema } from './job.schema';

export class JobListOutputSchema extends ListOutputSchema {
  @ApiProperty({
    description: 'An array of job objects associated with the workflow.',
    type: [JobSchema],
    example: [
      {
        id: 101,
        parentId: null,
        bullId: '#101',
        dedupeId: 'dedupe-abc-xyz',
        workflowId: 55,
        status: 'WAITING',
        trigger: 'EVENT',
        triggerId: 125,
        scheduledAt: '2024-10-01T12:00:00Z',
        payload: {
          userId: 123,
          action: 'sync_data',
        },
        createdAt: '2024-09-30T10:30:00Z',
        updatedAt: '2024-10-01T14:45:00Z',
      },
    ],
  })
  data: JobSchema[];
}
