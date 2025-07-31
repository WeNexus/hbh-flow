import { ApiProperty } from '@nestjs/swagger';
import { Event } from '@prisma/client';

export class EventSchema implements Event {
  @ApiProperty({
    description: 'Unique identifier for the event',
  })
  id: number;

  @ApiProperty({
    description: 'ID of the workflow the event is associated with',
  })
  workflowId: number;

  @ApiProperty({
    description: 'Name of the event',
  })
  name: string;

  @ApiProperty({
    description: 'Provider of the event, such as "shopify", "zoho", etc.',
    required: false,
  })
  provider: string | null;

  @ApiProperty({
    description: 'Connection ID that the event is associated with',
    required: false,
  })
  connection: string | null;

  @ApiProperty({
    description: 'Indicates if the event is active',
  })
  active: boolean;

  @ApiProperty({
    description:
      'Indicates if the event is dangling (removed from the workflow but not deleted)',
  })
  dangling: boolean;

  @ApiProperty({
    description: 'Timestamp when the event was created',
    required: false,
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Timestamp when the event was last updated',
    required: false,
  })
  updatedAt: Date | null;
}
