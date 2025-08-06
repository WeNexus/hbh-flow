import type { JsonValue } from '@prisma/client/runtime/library';
import { ApiProperty } from '@nestjs/swagger';
import { JobSchema } from './job.schema';

export class JobDetailSchema extends JobSchema {
  @ApiProperty({
    description: 'The payload data passed to the job at runtime.',
    example: {
      userId: 123,
      action: 'sync_data',
    },
  })
  payload: JsonValue;
}
