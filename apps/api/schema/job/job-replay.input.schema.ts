import { ApiProperty } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';

export class JobReplayInputSchema {
  @ApiProperty({
    description:
      'Optional contextual data to be passed when replaying the job. This can be used to modify behavior or provide additional information.',
    required: false,
  })
  @IsOptional()
  context?: Record<string, any>;
}
