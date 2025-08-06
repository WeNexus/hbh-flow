import { Activity, Resource, Action } from '@prisma/client';
import { JsonValue } from '@prisma/client/runtime/library';
import { ApiProperty } from '@nestjs/swagger';

export class ActivitySchema implements Activity {
  @ApiProperty({
    description: 'The unique identifier for the activity record.',
    example: 1,
  })
  id: number;

  @ApiProperty({
    description: 'User ID associated with the activity.',
    example: 123,
  })
  userId: number;

  @ApiProperty({
    description: 'The type of resource associated with the activity.',
    enum: Resource,
    example: 'WORKFLOW',
    nullable: true,
    required: false,
  })
  resource: Resource | null;

  @ApiProperty({
    description:
      'The unique identifier of the resource associated with the activity.',
    example: 'abc123',
    nullable: true,
    required: false,
  })
  resourceId: JsonValue | null;

  @ApiProperty({
    description: 'The action performed in the activity.',
    enum: Action,
    example: Action.CREATE,
  })
  action: Action;

  @ApiProperty({
    description: 'The sub-action performed in the activity, if applicable.',
    example: 'UPDATE_SETTINGS',
    nullable: true,
    required: false,
  })
  subAction: string | null;

  @ApiProperty({
    description: 'Additional details about the activity, stored as JSON.',
    example: {
      ip: '103.125.123.126',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    },
    nullable: true,
    required: false,
  })
  details: JsonValue | null;

  @ApiProperty({
    description: 'The date and time when the activity was recorded.',
    format: 'date-time',
    example: '2023-10-01T12:00:00Z',
  })
  createdAt: Date;
}
