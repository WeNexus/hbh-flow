import { Role as BaseRole } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import _ from 'lodash';

import {
  IsOptional,
  MinLength,
  IsString,
  IsEmail,
  IsEnum,
} from 'class-validator';

const Role = _.omit(BaseRole, 'SYSTEM');

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
