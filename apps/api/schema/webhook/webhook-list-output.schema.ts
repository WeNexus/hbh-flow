import { ListOutputSchema } from '#lib/core/schema';
import { WebhookSchema } from './webhook.schema';
import { ApiProperty } from '@nestjs/swagger';

export class WebhookListOutputSchema extends ListOutputSchema {
  @ApiProperty({
    description: 'List of webhooks',
    type: [WebhookSchema],
  })
  data: WebhookSchema[];
}
