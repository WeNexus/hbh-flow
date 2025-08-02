import { ApiProperty } from '@nestjs/swagger';

export class ConnectionSchema {
  @ApiProperty({
    description:
      'A unique identifier assigned by the provider for this connection.',
    example: 'conn_abc123',
  })
  id: string;

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
}
