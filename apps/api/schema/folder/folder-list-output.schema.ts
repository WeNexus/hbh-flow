import { ListOutputSchema } from '#lib/core/schema';
import { FolderSchema } from './folder.schema';
import { ApiProperty } from '@nestjs/swagger';

export class FolderListOutputSchema extends ListOutputSchema {
  @ApiProperty({
    description:
      'An array of folder objects representing the retrieved folder list.',
    type: [FolderSchema],
  })
  data: FolderSchema[];
}
