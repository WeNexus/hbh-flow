import { ListOutputSchema } from '#lib/core/schema';
import { WorkflowSchema } from './workflow.schema';
import { ApiProperty } from '@nestjs/swagger';

export class WorkflowListOutputSchema extends ListOutputSchema {
  @ApiProperty({
    type: [WorkflowSchema],
    description: 'List of workflows available in the system',
  })
  data: WorkflowSchema[];
}
