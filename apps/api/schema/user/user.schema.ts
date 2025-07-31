import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class UserSchema {
  @ApiProperty({
    description: 'A Unique identifier for the user',
  })
  id: number;

  @ApiProperty({
    description: 'Role of the user in the system',
  })
  @ApiProperty({ enum: Role })
  role: Role;

  @ApiProperty({
    description: 'User email address',
  })
  @ApiProperty({ format: 'email' })
  email: string;

  @ApiProperty({
    description: 'User name',
    example: 'John Doe',
  })
  name: string;

  @ApiProperty({
    description: 'Timestamp when the user was created',
    format: 'date-time',
    example: '2023-10-01T12:00:00Z',
  })
  createdAt: Date;
}
