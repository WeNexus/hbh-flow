import { ApiProperty } from '@nestjs/swagger';

export class ConnectionAuthorizationOutputSchema {
  @ApiProperty({
    description: 'The URL to redirect the user to for OAuth2 authorization.',
    format: 'uri',
  })
  authorizationUrl: string;
}
