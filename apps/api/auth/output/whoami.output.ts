import { ApiProperty } from '@nestjs/swagger';

export class WhoamiOutput {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ example: '2023-10-01T12:00:00Z' })
  createdAt: Date;
}
