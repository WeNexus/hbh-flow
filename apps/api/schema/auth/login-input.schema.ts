import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginInputSchema {
  @ApiProperty({
    description: 'The email address of the user. Must be a valid email format.',
    example: 'example@honeybeeherb.com',
    format: 'email',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description:
      'The user’s login password. Must be at least 8 characters long.',
    example: 'password123',
    minLength: 8,
  })
  @IsNotEmpty()
  @IsString()
  password: string;
}
