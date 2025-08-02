import { ListOutputSchema } from '#lib/core/schema';
import { ProviderSchema } from './provider.schema';
import { ApiProperty } from '@nestjs/swagger';

export class ProviderListOutputSchema extends ListOutputSchema {
  @ApiProperty({
    description: 'An array of provider objects available in the system.',
    type: [ProviderSchema],
    example: [
      {
        id: 'zoho',
        type: 'oauth2',
        name: 'Zoho',
        icon: 'https://example.com/zoho-icon.png',
      },
      {
        id: 'shopify',
        type: 'token',
        name: 'Shopify',
        icon: 'https://example.com/shopify-icon.png',
      },
    ],
  })
  data: ProviderSchema[];
}
