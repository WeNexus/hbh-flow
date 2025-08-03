import { IsNotEmpty, IsOptional, IsPositive, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class FolderCreateInputSchema {
  @ApiProperty({
    description:
      'The unique identifier of the parent folder, if this folder is a subfolder. Optional.',
    example: 42,
    required: false,
  })
  @IsOptional()
  @IsPositive()
  parentId?: number | null;

  @ApiProperty({
    description: 'The display name of the folder. This field is required.',
    example: 'BigCommerce',
    required: true,
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description:
      'An optional description providing more details about the folder.',
    example:
      'Contains all workflows related to BigCommerce and Zoho Integration.',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string | null;
}
