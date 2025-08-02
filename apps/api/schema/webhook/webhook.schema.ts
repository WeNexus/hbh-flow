import { WebhookCreateInputSchema } from './webhook-create-input.schema';
import { ApiProperty } from '@nestjs/swagger';

export class WebhookSchema extends WebhookCreateInputSchema {
  @ApiProperty({
    description: 'The date and time when the webhook was created.',
    format: 'date-time',
    example: '2023-10-01T12:00:00Z',
  })
  createdAt: Date;

  @ApiProperty({
    description:
      'The date and time when the webhook was last updated. May be null if it has not been updated.',
    format: 'date-time',
    example: '2023-10-01T12:00:00Z',
  })
  updatedAt: Date | null;
}
