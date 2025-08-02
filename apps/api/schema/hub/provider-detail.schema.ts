import { ConnectionSchema } from '../connection/connection.schema';
import { ProviderSchema } from './provider.schema';
import { ApiProperty } from '@nestjs/swagger';

export class ProviderDetailSchema extends ProviderSchema {
  @ApiProperty({
    description:
      'A list of OAuth2 scopes required by the provider, if applicable.',
    type: [String],
    example: ['read_orders', 'write_customers'],
    required: false,
  })
  scopes?: string[];

  @ApiProperty({
    description:
      'An array of connection objects associated with this provider.',
    type: [ConnectionSchema],
    example: [
      {
        id: 'conn_abc123',
        description: 'Primary Zoho integration',
        scopes: ['read_leads', 'write_contacts'],
      },
    ],
  })
  connections: ConnectionSchema[];
}
