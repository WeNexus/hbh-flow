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
    enum: Role,
    required: false,
  })
  @IsEnum(Role)
  @IsOptional()
  role: keyof typeof Role;

  @ApiProperty({ required: false })
  @IsEmail()
  @IsOptional()
  email: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  name: string;

  @ApiProperty({ required: false })
  @IsString()
  @MinLength(8)
  @IsOptional()
  password: string;
}
