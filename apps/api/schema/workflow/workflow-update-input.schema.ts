import { IsBoolean, IsOptional, IsPositive } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class WorkflowUpdateInputSchema {
  @ApiProperty({
    description:
      'Specifies whether the workflow should be active. If set to true, the workflow will execute when triggered.',
    required: false,
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiProperty({
    description:
      'The ID of the folder that the workflow should be assigned to.',
    required: false,
    example: 5,
  })
  @IsOptional()
  @IsPositive()
  folderId?: number;
}
