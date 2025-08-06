import { ListOutputSchema } from '#lib/core/schema';
import { RevisionSchema } from './revision.schema';
import { ApiProperty } from '@nestjs/swagger';

export class RevisionListOutputSchema extends ListOutputSchema {
  @ApiProperty({
    description:
      'An array of revision records, each containing details about the revision.',
    type: [RevisionSchema],
    example: [
      {
        id: 1,
        resource: 'WORKFLOW',
        resourceId: 'abc123',
        action: 'CREATE',
        data: { key: 'value', another: 123 },
        delta: { key: ['value', 'newValue'], another: [123, 456] },
        createdAt: '2023-10-01T12:00:00Z',
      },
    ],
  })
  data: RevisionSchema[];
}
