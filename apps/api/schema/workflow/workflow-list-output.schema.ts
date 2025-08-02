import { ListOutputSchema } from '#lib/core/schema';
import { WorkflowSchema } from './workflow.schema';
import { ApiProperty } from '@nestjs/swagger';

export class WorkflowListOutputSchema extends ListOutputSchema {
  @ApiProperty({
    type: [WorkflowSchema],
    description: 'An array of workflow objects available in the system.',
    example: [
      {
        id: 101,
        key: 'SyncOrders',
        folderId: 12,
        active: true,
        createdAt: '2023-10-01T12:00:00Z',
        updatedAt: '2023-10-02T15:30:00Z',
      },
      {
        id: 102,
        key: 'SyncCustomers',
        folderId: null,
        active: false,
        createdAt: '2023-10-03T08:00:00Z',
        updatedAt: null,
      },
    ],
  })
  data: WorkflowSchema[];
}
