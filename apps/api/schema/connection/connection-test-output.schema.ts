import { ApiProperty } from '@nestjs/swagger';

export class ConnectionTestOutputSchema {
  @ApiProperty({
    description: 'Indicates whether the test was successful',
  })
  working: boolean;

  @ApiProperty({
    description: 'Reason for failure in case the test was unsuccessful',
    required: false,
  })
  reason?: string;
}
