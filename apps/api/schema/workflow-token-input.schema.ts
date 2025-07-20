import { IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class WorkflowTokenInputSchema {
  @ApiProperty({
    name: 'workflow',
    description: 'The name of the workflow for which to generate a token',
  })
  @IsNotEmpty()
  workflow: string;

  @ApiProperty({
    name: 'key',
    description:
      'The key to identify the token in case of multiple tokens for the same workflow',
    required: true,
  })
  @IsNotEmpty()
  key: string;

  @ApiProperty({
    name: 'expiresIn',
    description: 'The expiration time for the token in seconds',
    required: false,
    default: /* 1 week */ 604800,
  })
  @IsOptional()
  expiresIn?: number;
}
