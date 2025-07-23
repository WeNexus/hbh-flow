import { ApiProperty } from '@nestjs/swagger';

export class ConnectionTestOutputSchema {
  @ApiProperty({
    description: 'Indicates if the connection test was successful',
  })
  working: boolean;

  @ApiProperty({
    description: 'Reason for failure if the connection test was not successful',
    required: false,
  })
  reason?: string;
}
