import { ConnectionSchema } from '../connection/connection.schema';
import { ProviderSchema } from './provider.schema';
import { ApiProperty } from '@nestjs/swagger';

export class ProviderDetailSchema extends ProviderSchema {
  @ApiProperty({
    description: 'Scopes required for the provider in case of OAuth2',
    type: [String],
    required: false,
  })
  scopes?: string[];

  @ApiProperty({
    description: 'Connections available for the provider',
    type: [ConnectionSchema],
  })
  connections: ConnectionSchema[];
}
