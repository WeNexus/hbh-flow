import type { JsonValue } from '@prisma/client/runtime/library';
import { Resource, Action, Revision } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class RevisionSchema implements Revision {
  @ApiProperty({
    description: 'The unique identifier for the revision.',
    example: 1,
  })
  id: number;

  @ApiProperty({
    description: 'The unique identifier of the user who created the revision.',
    example: 123,
  })
  userId: number;

  @ApiProperty({
    description: 'The type of resource associated with the revision.',
    enum: Resource,
    example: 'WORKFLOW',
  })
  resource: Resource;

  @ApiProperty({
    description:
      'The unique identifier of the resource associated with the revision.',
    example: 'abc123',
    nullable: true,
    required: false,
  })
  resourceId: JsonValue;

  @ApiProperty({
    description: 'The action performed in the revision.',
    enum: Action,
    example: Action.CREATE,
  })
  action: Action;

  // data
  @ApiProperty({
    description: 'The data associated with the revision, stored as JSON.',
    example: {
      key: 'value',
      anotherKey: 123,
    },
  })
  data: JsonValue;

  @ApiProperty({
    description: 'The delta changes made in the revision, stored as JSON.',
    example: { key: ['value', 'newValue'], another: [123, 456] },
    externalDocs: {
      url: 'https://github.com/benjamine/jsondiffpatch?tab=readme-ov-file',
      description: 'Documentation for JSON diff patching.',
    },
  })
  delta: JsonValue;

  @ApiProperty({
    description: 'The date and time when the revision was created.',
    format: 'date-time',
    example: '2023-10-01T12:00:00Z',
  })
  createdAt: Date;
}
