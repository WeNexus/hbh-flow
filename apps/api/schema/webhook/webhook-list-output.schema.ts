import { ListOutputSchema } from '#lib/core/schema';
import { WebhookSchema } from './webhook.schema';
import { ApiProperty } from '@nestjs/swagger';

export class WebhookListOutputSchema extends ListOutputSchema {
  @ApiProperty({
    description:
      'An array of webhook objects representing configured webhooks.',
    type: [WebhookSchema],
    example: [
      {
        id: 1,
        workflowId: 42,
        name: 'Shopify Order Created',
        description: 'Triggered when an order is created in Shopify.',
        secret: 'abc123',
        hashLocation: 'HEADER',
        hashKey: 'x-shopify-hmac-sha256',
        hashAlgorithm: 'sha256',
        expiresAt: '2023-10-01T00:00:00Z',
        createdAt: '2023-09-01T12:00:00Z',
        updatedAt: '2023-09-15T15:30:00Z',
      },
    ],
  })
  data: WebhookSchema[];
}
