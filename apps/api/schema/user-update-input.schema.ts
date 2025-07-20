import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import {
  IsOptional,
  MinLength,
  IsString,
  IsEmail,
  IsEnum,
} from 'class-validator';

export class UserUpdateInputSchema {
  @ApiProperty({
    enum: Role,
    required: false,
  })
  @IsEnum(Role)
  @IsOptional()
  role: Role;

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
