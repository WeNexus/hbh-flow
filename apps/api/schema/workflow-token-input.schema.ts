import { IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class WorkflowTokenInputSchema {
  @ApiProperty({
    name: 'workflow',
    description: 'The name of the workflow for which to generate a token',
    type: String,
  })
  @IsNotEmpty()
  workflow: string;

  @ApiProperty({
    name: 'expiresIn',
    description: 'The expiration time for the token in seconds',
    type: Number,
    required: false,
    default: /* 1 week */ 604800,
  })
  @IsOptional()
  expiresIn?: number;
}
