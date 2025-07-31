import { ListOutputSchema } from '#lib/core/schema';
import { FolderSchema } from './folder.schema';
import { ApiProperty } from '@nestjs/swagger';

export class FolderListOutputSchema extends ListOutputSchema {
  @ApiProperty({
    description: 'List of webhooks',
    type: [FolderSchema],
  })
  data: FolderSchema[];
}
