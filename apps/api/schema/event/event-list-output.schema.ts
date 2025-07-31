import { ListOutputSchema } from '#lib/core/schema';
import { ApiProperty } from '@nestjs/swagger';
import { EventSchema } from './event.schema';

export class EventListOutputSchema extends ListOutputSchema {
  @ApiProperty({
    description: 'List of events',
    type: [EventSchema],
  })
  data: EventSchema[];
}
