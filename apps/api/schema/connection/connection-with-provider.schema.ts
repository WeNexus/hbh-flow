import { ProviderSchema } from '../hub/provider.schema';
import { ConnectionSchema } from './connection.schema';
import { ApiProperty } from '@nestjs/swagger';

export class ConnectionWithProviderSchema extends ConnectionSchema {
  @ApiProperty({
    description: 'The provider details associated with this connection.',
    type: ProviderSchema,
    example: {
      id: 'shopify',
      type: 'oauth2',
      name: 'Shopify',
      icon: 'https://example.com/icon.png',
    },
  })
  provider: ProviderSchema;
}
