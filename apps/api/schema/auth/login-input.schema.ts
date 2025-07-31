import { IsEmail, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginInputSchema {
  @ApiProperty({
    description: 'User email address',
    example: 'example@honeybeeherb.com',
    format: 'email',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'User password',
    example: 'password123',
    minLength: 8,
  })
  @IsNotEmpty()
  password: string;
}
