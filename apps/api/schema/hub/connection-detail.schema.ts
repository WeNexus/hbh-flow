import { ConnectionSchema } from './connection.schema';
import { ApiProperty } from '@nestjs/swagger';
import { UserSchema } from '../user.schema';

export class ConnectionDetailSchema extends ConnectionSchema {
  @ApiProperty({ description: 'Indicates if the connection is working' })
  working: boolean;

  @ApiProperty({
    description: 'The reason why the connection is not working, if applicable',
    required: false,
  })
  reason?: string;

  @ApiProperty({
    description: 'The date and time when the token was last refreshed',
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
    description: 'The user who established the connection',
    required: false,
    type: UserSchema,
  })
  connectedBy?: UserSchema;

  @ApiProperty({
    description: 'The user associated with the connection',
    required: false,
  })
  connectedUser?: Record<string, any>;
}
