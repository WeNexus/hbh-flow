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

  @ApiProperty({
    description:
      'Optional list of specific steps to replay within the job. If not provided, the entire job will be replayed.',
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  steps?: string[];

  @ApiProperty({
    description:
      'Optional step identifier to start the replay from. If provided, the job will be replayed starting from this step onward. Either "steps" or "from" can be provided, but not both.',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  from?: string;

  @ApiProperty({
    description:
      'Optional step identifier to end the replay at. If provided, the job will be replayed up to and including this step. Either "steps" or "to" can be provided, but not both.',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  to?: string;
}
