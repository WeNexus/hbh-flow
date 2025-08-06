import { ListOutputSchema } from '#lib/core/schema';
import { ActivitySchema } from './activity.schema';
import { ApiProperty } from '@nestjs/swagger';

export class ActivityListOutputSchema extends ListOutputSchema {
  @ApiProperty({
    description:
      'An array of activity records, each containing details about the activity.',
    type: [ActivitySchema],
    example: [
      {
        id: 1,
        userId: 123,
        resource: 'WORKFLOW',
        resourceId: 'abc123',
        action: 'CREATE',
        subAction: 'UPDATE_SETTINGS',
        details: {
          ip: '102.134.133.123',
          userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
        createdAt: '2023-10-01T12:00:00Z',
      },
    ],
  })
  data: ActivitySchema[];
}
