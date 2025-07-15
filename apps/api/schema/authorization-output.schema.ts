import { ApiProperty } from '@nestjs/swagger';

export class AuthorizationOutputSchema {
  @ApiProperty({
    type: 'string',
    format: 'uri',
    description: 'The URL to redirect the user for OAuth2 authorization.',
  })
  authorizationUrl: string;
}
