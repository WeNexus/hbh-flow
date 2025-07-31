import { ApiProperty } from '@nestjs/swagger';

export class LoginOutputSchema {
  @ApiProperty({
    description:
      'A CSRF token that must be included in subsequent requests to protect against CSRF attacks.',
  })
  csrfToken: string;

  @ApiProperty({
    description: 'Timestamp when the authentication session expires.',
    example: '2024-10-01T12:00:00.000Z',
    format: 'date-time',
  })
  expiresAt: Date;
}
