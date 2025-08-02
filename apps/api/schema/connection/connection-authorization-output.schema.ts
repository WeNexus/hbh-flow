import { ApiProperty } from '@nestjs/swagger';

export class ConnectionAuthorizationOutputSchema {
  @ApiProperty({
    description:
      'The URL to which the user should be redirected to initiate the OAuth2 authorization process.',
    format: 'uri',
    example:
      'https://accounts.example.com/oauth2/authorize?client_id=abc123&response_type=code',
  })
  authorizationUrl: string;
}
