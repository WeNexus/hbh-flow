import { ListOutputSchema } from '#lib/core/schema';
import { ApiProperty } from '@nestjs/swagger';
import { JobSchema } from './job.schema';

export class JobListOutputSchema extends ListOutputSchema {
  @ApiProperty({
    description: 'List of jobs for the workflow',
    type: [JobSchema],
  })
  data: JobSchema[];
}
