import { Role as BaseRole } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { omit } from 'lodash-es';

import {
  IsNotEmpty,
  MinLength,
  IsString,
  IsEmail,
  IsEnum,
} from 'class-validator';

const Role = omit(BaseRole, 'SYSTEM');

export class UserCreateInputSchema {
  @ApiProperty({
    description: 'Role assigned to the user. SYSTEM role is excluded.',
    enum: Role,
    required: true,
    example: 'ADMIN',
  })
  @IsEnum(Role)
  role: keyof typeof BaseRole;

  @ApiProperty({
    description: 'Email address of the user.',
    format: 'email',
    required: true,
    example: 'jane.doe@honeybeeherb.com',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'Full name of the user.',
    required: true,
    example: 'Jane Doe',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description:
      'Password for the user account. Must be at least 8 characters long.',
    required: true,
    minLength: 8,
    example: 'securePassword123',
  })
  @IsString()
  @MinLength(8)
  password: string;
}
