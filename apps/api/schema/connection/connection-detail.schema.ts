import { ConnectionSchema } from './connection.schema';
import { UserSchema } from '../user/user.schema';
import { ApiProperty } from '@nestjs/swagger';

export class ConnectionDetailSchema extends ConnectionSchema {
  @ApiProperty({
    description: 'Indicates whether the connection is working',
  })
  working: boolean;

  @ApiProperty({
    description: 'The reason why the connection is not working, if applicable',
    required: false,
  })
  reason?: string;

  @ApiProperty({
    description:
      'The date and time when the tokens were last refreshed. Applicable for OAuth connections',
    required: false,
    format: 'date-time',
    example: '2023-10-01T12:00:00Z',
  })
  tokenRefreshedAt?: string;

  @ApiProperty({
    description: 'The date and time when the connection was established',
    required: false,
    format: 'date-time',
    example: '2023-10-01T12:00:00Z',
  })
  connectedAt?: string;

  @ApiProperty({
    description: 'The Flow user who established the connection',
    required: false,
    type: UserSchema,
  })
  connectedBy?: UserSchema;

  @ApiProperty({
    description: 'The third-party user associated with the connection',
    required: false,
  })
  connectedUser?: Record<string, any>;
}
