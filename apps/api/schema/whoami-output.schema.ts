import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class WhoamiOutputSchema {
  @ApiProperty()
  id: number;

  @ApiProperty({ enum: Role })
  role: Role;

  @ApiProperty()
  email: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ example: '2023-10-01T12:00:00Z' })
  createdAt: Date;
}
