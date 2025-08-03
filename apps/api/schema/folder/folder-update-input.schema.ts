import { IsNotEmpty, IsOptional, IsPositive, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class FolderUpdateInputSchema {
  @ApiProperty({
    description:
      'The ID of the parent folder, if this folder is a subfolder. Optional.',
    example: 42,
    required: false,
  })
  @IsOptional()
  @IsPositive()
  parentId?: number | null;

  @ApiProperty({
    description:
      'The updated name of the folder. Optional, but must not be empty if provided.',
    example: 'Updated Folder Name',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiProperty({
    description: 'An optional updated description of the folder.',
    example: 'Updated description for a workflow folder.',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  description?: string | null;
}
