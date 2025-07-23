import type { ClientType } from '#lib/hub/types';
import { ApiProperty } from '@nestjs/swagger';

export class ProviderSchema {
  @ApiProperty({ description: 'The unique identifier for the provider' })
  id: string;

  @ApiProperty({
    description: 'The type of the provider',
    enum: ['oauth2', 'token'],
  })
  type: ClientType;

  @ApiProperty({
    description: 'The name of the provider',
    example: 'Zoho',
  })
  name: string;

  @ApiProperty({
    description: 'The icon URL for the provider',
    example: 'https://example.com/icon.png',
    required: false,
  })
  icon?: string;
}
