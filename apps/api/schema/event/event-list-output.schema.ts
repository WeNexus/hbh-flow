import { ListOutputSchema } from '#lib/core/schema';
import { ApiProperty } from '@nestjs/swagger';
import { EventSchema } from './event.schema';

export class EventListOutputSchema extends ListOutputSchema {
  @ApiProperty({
    description: 'An array of event objects representing the retrieved events.',
    type: [EventSchema],
    example: [
      {
        id: 1,
        workflowId: 100,
        name: 'Order Created',
        provider: 'shopify',
        connection: 'conn_abc123',
        active: true,
        dangling: false,
        createdAt: '2023-10-01T12:00:00Z',
        updatedAt: '2023-10-02T15:30:00Z',
      },
      {
        id: 2,
        workflowId: 100,
        name: 'Customer Updated',
        provider: 'zoho',
        connection: 'conn_xyz789',
        active: true,
        dangling: false,
        createdAt: '2023-10-03T10:00:00Z',
        updatedAt: null,
      },
    ],
  })
  data: EventSchema[];
}
