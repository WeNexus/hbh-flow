import { ConnectionSchema } from './connection.schema';
import { ApiProperty } from '@nestjs/swagger';

export class ConnectionDetailSchema extends ConnectionSchema {
  @ApiProperty({
    description:
      'Timestamp of the most recent token refresh, applicable to OAuth2 connections.',
    format: 'date-time',
    example: '2023-10-01T12:00:00Z',
    required: false,
  })
  tokenRefreshedAt?: string;

  @ApiProperty({
    description:
      'Timestamp indicating when the connection was initially established.',
    format: 'date-time',
    example: '2023-10-01T12:00:00Z',
    required: false,
  })
  connectedAt?: string;

  @ApiProperty({
    description:
      'The third-party user information associated with the connection, if available.',
    required: false,
    example: {
      email: 'user@example.com',
      externalId: 'ext_12345',
    },
  })
  connectedUser?: Record<string, any>;
}
