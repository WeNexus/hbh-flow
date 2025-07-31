import { ApiProperty } from '@nestjs/swagger';

export class ConnectionSchema {
  @ApiProperty({
    description: 'A unique identifier within the provider for the connection',
  })
  id: string;

  @ApiProperty({
    description: 'The description of the connection',
    required: false,
  })
  description?: string;

  @ApiProperty({
    description: 'Scopes required for the connection in case of OAuth2',
    type: [String],
    required: false,
  })
  scopes?: string[];
}
