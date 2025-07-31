import { ListOutputSchema } from '#lib/core/schema';
import { ProviderSchema } from './provider.schema';
import { ApiProperty } from '@nestjs/swagger';

export class ProviderListOutputSchema extends ListOutputSchema {
  @ApiProperty({
    description: 'List of providers',
    type: [ProviderSchema],
  })
  data: ProviderSchema[];
}
