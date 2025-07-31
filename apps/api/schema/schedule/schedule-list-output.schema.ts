import { ListOutputSchema } from '#lib/core/schema';
import { ScheduleSchema } from './schedule.schema';
import { ApiProperty } from '@nestjs/swagger';

export class ScheduleListOutputSchema extends ListOutputSchema {
  @ApiProperty({
    description: 'List of webhooks',
    type: [ScheduleSchema],
  })
  data: ScheduleSchema[];
}
