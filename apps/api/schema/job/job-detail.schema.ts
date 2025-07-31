import { ApiProperty } from '@nestjs/swagger';
import { StepSchema } from './step.schema';
import { JobSchema } from './job.schema';

export class JobDetailSchema extends JobSchema {
  @ApiProperty({
    description: 'List of steps executed in the job',
    type: [StepSchema],
  })
  Steps: StepSchema[];
}
