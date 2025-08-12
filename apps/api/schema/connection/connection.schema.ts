import { UserSchema } from '../user/user.schema';
import { ApiProperty } from '@nestjs/swagger';

export class ConnectionSchema {
  @ApiProperty({
    description:
      'A unique identifier assigned by the provider for this connection.',
    example: 'conn_abc123',
  })
  id: string;

  @ApiProperty({
    description:
      'Indicates whether the connection is currently functioning as expected.',
    example: true,
  })
  working: boolean;

  @ApiProperty({
    description:
      'Explanation of why the connection is not working, if applicable.',
    example: 'Invalid credentials or token expired.',
    required: false,
  })
  reason?: string;

  @ApiProperty({
    description: 'Timestamp when the connection was last tested.',
    example: '2023-10-01T12:00:00Z',
    required: false,
  })
  testedAt?: Date;

  @ApiProperty({
    description: 'A brief description of the connection. Optional.',
    example: 'Shopify main store integration',
    required: false,
  })
  description?: string;

  @ApiProperty({
    description:
      'List of scopes required by the connection if using OAuth2. Optional.',
    type: [String],
    example: ['read_orders', 'write_customers'],
    required: false,
  })
  scopes?: string[];

  @ApiProperty({
    description: 'The Flow user who established the connection.',
    type: UserSchema,
    required: false,
  })
  connectedBy?: UserSchema;
}
