import { ApiProperty } from '@nestjs/swagger';
import { Workflow } from '@prisma/client';

export class WorkflowSchema implements Workflow {
  @ApiProperty({
    description:
      'A unique number that identifies the workflow, given by prisma',
  })
  id: number;

  @ApiProperty({
    description: 'The unique key to identify the workflow',
  })
  key: string;

  @ApiProperty({
    description: 'The ID of the folder that contains the workflow',
    required: false,
  })
  folderId: number | null;

  @ApiProperty({
    description: 'Whether the workflow is active or not',
  })
  active: boolean;

  @ApiProperty({
    description: 'Timestamp when the workflow was created',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Timestamp when the workflow was last updated',
  })
  updatedAt: Date | null;
}
