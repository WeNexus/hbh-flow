import { ApiProperty } from '@nestjs/swagger';

export class ConnectionTestOutputSchema {
  @ApiProperty({
    description: 'Indicates whether the connection test was successful.',
    example: true,
  })
  working: boolean;

  @ApiProperty({
    description:
      'The reason for failure if the test did not succeed. Optional.',
    example: 'Connection timeout or invalid credentials.',
    required: false,
  })
  reason?: string;
}
