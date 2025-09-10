import { FolderCreateInputSchema } from './folder-create-input.schema';
import { ApiProperty } from '@nestjs/swagger';

export class FolderSchema extends FolderCreateInputSchema {
  @ApiProperty({
    description: 'A unique numeric identifier assigned to the folder.',
    example: 101,
  })
  id: number;

  @ApiProperty({
    description:
      'The number of immediate child folders contained within this folder.',
    example: 5,
  })
  childrenCount: number;

  @ApiProperty({
    description: 'The date and time when the folder was initially created.',
    format: 'date-time',
    example: '2023-10-01T12:00:00Z',
  })
  createdAt: Date;

  @ApiProperty({
    description:
      'The date and time when the folder was last updated. May be null if no updates have occurred.',
    format: 'date-time',
    example: '2023-10-01T12:00:00Z',
  })
  updatedAt: Date | null;
}
