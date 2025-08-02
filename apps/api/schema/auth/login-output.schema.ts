import { ApiProperty } from '@nestjs/swagger';

export class LoginOutputSchema {
  @ApiProperty({
    description:
      'A CSRF token to be included in subsequent client requests to safeguard against Cross-Site Request Forgery (CSRF) attacks.',
    example: 'csrf_token_123456abcdef',
  })
  csrfToken: string;

  @ApiProperty({
    description:
      'The exact date and time when the current authentication session will expire.',
    example: '2024-10-01T12:00:00.000Z',
    format: 'date-time',
  })
  expiresAt: Date;
}
