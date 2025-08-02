import type { ClientType } from '#lib/hub/types';
import { ApiProperty } from '@nestjs/swagger';

export class ProviderSchema {
  @ApiProperty({
    description: 'A unique identifier for the provider.',
    example: 'zoho',
  })
  id: string;

  @ApiProperty({
    description: 'The authentication method used by the provider.',
    enum: ['oauth2', 'token'],
    example: 'oauth2',
  })
  type: ClientType;

  @ApiProperty({
    description: 'The display name of the provider.',
    example: 'Zoho',
  })
  name: string;

  @ApiProperty({
    description: 'A URL pointing to the provider’s icon. Optional.',
    example: 'https://example.com/icon.png',
    required: false,
  })
  icon?: string;
}
