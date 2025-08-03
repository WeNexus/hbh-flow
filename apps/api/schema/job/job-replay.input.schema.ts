import { IsJSON, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class JobReplayInputSchema {
  @ApiProperty({
    description:
      'Optional contextual data to be passed when replaying the job. This can be used to modify behavior or provide additional information.',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @IsJSON()
  context?: string;
}
