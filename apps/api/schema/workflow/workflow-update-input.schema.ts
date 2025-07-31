import { IsOptional, IsPositive } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class WorkflowUpdateInputSchema {
  @ApiProperty({
    description:
      'Whether the workflow is active or not. If true, the workflow will be executed when triggered.',
    required: false,
  })
  @IsOptional()
  active?: boolean;

  @ApiProperty({
    description: 'The ID of the folder to which the workflow belongs.',
  })
  @IsOptional()
  @IsPositive()
  folderId?: number;
}
