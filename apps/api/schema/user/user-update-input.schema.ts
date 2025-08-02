import { Role as BaseRole } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { omit } from 'lodash-es';

import {
  IsOptional,
  MinLength,
  IsString,
  IsEmail,
  IsEnum,
} from 'class-validator';

const Role = omit(BaseRole, 'SYSTEM');

export class UserUpdateInputSchema {
  @ApiProperty({
    description: 'Updated role for the user. The SYSTEM role is excluded.',
    enum: Role,
    required: false,
    example: 'DEVELOPER',
  })
  @IsEnum(Role)
  @IsOptional()
  role: keyof typeof Role;

  @ApiProperty({
    description: 'Updated email address of the user.',
    required: false,
    format: 'email',
    example: 'new.email@example.com',
  })
  @IsEmail()
  @IsOptional()
  email: string;

  @ApiProperty({
    description: 'Updated full name of the user.',
    required: false,
    example: 'Updated Name',
  })
  @IsString()
  @IsOptional()
  name: string;

  @ApiProperty({
    description:
      'New password for the user account. Must be at least 8 characters long.',
    required: false,
    minLength: 8,
    example: 'newStrongPassword123',
  })
  @IsString()
  @MinLength(8)
  @IsOptional()
  password: string;
}
