import { IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class FolderCreateInputSchema {
  @ApiProperty({
    description: 'Parent folder ID, if this folder is a subfolder',
  })
  @IsOptional()
  parentId?: number | null;

  @ApiProperty({
    description: 'The name of the folder',
    required: true,
  })
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'A description of the folder',
  })
  @IsOptional()
  description?: string | null;
}
