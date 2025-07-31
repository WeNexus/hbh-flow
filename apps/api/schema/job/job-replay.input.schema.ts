import { ApiProperty } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';

export class JobReplayInputSchema {
  @ApiProperty({
    description: 'Some context data to be used during the job replay',
    required: false,
  })
  @IsOptional()
  context?: Record<string, any>;
}
