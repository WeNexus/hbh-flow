import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class UserSchema {
  @ApiProperty({
    description: 'A unique numeric identifier for the user.',
    example: 1,
  })
  id: number;

  @ApiProperty({
    description: 'Role assigned to the user in the system.',
    enum: Role,
    example: Role.ADMIN,
  })
  role: Role;

  @ApiProperty({
    description: 'Email address of the user.',
    format: 'email',
    example: 'john.doe@honeybeeherb.com',
  })
  email: string;

  @ApiProperty({
    description: 'Full name of the user.',
    example: 'John Doe',
  })
  name: string;

  @ApiProperty({
    description: 'The date and time when the user account was last updated.',
    format: 'date-time',
    example: '2023-10-15T15:30:00Z',
    required: false,
  })
  updatedAt?: Date | null;

  @ApiProperty({
    description: 'The date and time when the user account was created.',
    format: 'date-time',
    example: '2023-10-01T12:00:00Z',
  })
  createdAt: Date;
}
