import { ApiProperty } from '@nestjs/swagger';
import { Event } from '@prisma/client';

export class EventSchema implements Event {
  @ApiProperty({
    description: 'Unique identifier for the event.',
    example: 101,
  })
  id: number;

  @ApiProperty({
    description: 'Identifier of the workflow associated with this event.',
    example: 15,
  })
  workflowId: number;

  @ApiProperty({
    description: 'Descriptive name of the event.',
    example: 'Order Created',
  })
  name: string;

  @ApiProperty({
    description:
      'Name of the event provider, such as "shopify", "zoho", etc. Optional.',
    example: 'shopify',
    required: false,
  })
  provider: string | null;

  @ApiProperty({
    description: 'ID of the connection this event is linked to. Optional.',
    example: 'conn_abc123',
    required: false,
  })
  connection: string | null;

  @ApiProperty({
    description: 'Indicates whether the event is currently active.',
    example: true,
  })
  active: boolean;

  @ApiProperty({
    description:
      'Indicates whether the event is dangling—i.e., removed from the workflow but not deleted.',
    example: false,
  })
  dangling: boolean;

  @ApiProperty({
    description: 'The timestamp when the event was created.',
    example: '2023-10-01T12:00:00Z',
    required: false,
  })
  createdAt: Date;

  @ApiProperty({
    description:
      'The timestamp when the event was last updated. Can be null if never updated.',
    example: '2023-10-02T15:30:00Z',
    required: false,
  })
  updatedAt: Date | null;
}
