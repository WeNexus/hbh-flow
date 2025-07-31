import { WebhookCreateInputSchema } from './webhook-create-input.schema';
import { ApiProperty } from '@nestjs/swagger';

export class WebhookSchema extends WebhookCreateInputSchema {
  @ApiProperty({
    description: 'Created at timestamp',
    format: 'date-time',
    example: '2023-10-01T12:00:00Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Updated at timestamp',
    format: 'date-time',
    example: '2023-10-01T12:00:00Z',
  })
  updatedAt: Date | null;
}
