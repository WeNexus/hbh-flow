import { ExecutionsSchema } from './executions.schema';
import { ApiProperty } from '@nestjs/swagger';

export class DashboardOutputSchema {
  @ApiProperty({
    description: 'Executions statistics',
    required: true,
    type: ExecutionsSchema,
  })
  executions: ExecutionsSchema;
}
