import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { Role as BaseRole } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { omit } from 'lodash-es';

const Role = omit(BaseRole, 'SYSTEM');

export class UserCreateInputSchema {
  @ApiProperty({ enum: Role, required: true })
  @IsEnum(Role)
  role: keyof typeof BaseRole;

  @ApiProperty({ format: 'email', required: true })
  @IsEmail()
  email: string;

  @ApiProperty({ required: true })
  @IsString()
  name: string;

  @ApiProperty({ required: true, minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;
}
