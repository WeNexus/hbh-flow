import { ListOutputSchema } from '#lib/core/schema';
import { ScheduleSchema } from './schedule.schema';
import { ApiProperty } from '@nestjs/swagger';

export class ScheduleListOutputSchema extends ListOutputSchema {
  @ApiProperty({
    description:
      'An array of schedule objects representing scheduled tasks or workflows.',
    type: [ScheduleSchema],
    example: [
      {
        id: 1,
        workflowId: 101,
        cronExpression: '0 0 * * *',
        active: true,
        dangling: false,
        userDefined: true,
        createdAt: '2023-10-01T12:00:00Z',
        updatedAt: '2023-10-02T14:00:00Z',
      },
      {
        id: 2,
        workflowId: 102,
        cronExpression: '0 */6 * * *',
        active: false,
        dangling: true,
        userDefined: true,
        createdAt: '2023-10-03T08:30:00Z',
        updatedAt: null,
      },
    ],
  })
  data: ScheduleSchema[];
}
