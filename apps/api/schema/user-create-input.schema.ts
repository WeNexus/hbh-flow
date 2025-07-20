import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class UserCreateInputSchema {
  @ApiProperty({ enum: Role, required: true })
  @IsEnum(Role)
  role: Role;

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
