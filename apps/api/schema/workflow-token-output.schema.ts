import { ApiProperty } from '@nestjs/swagger';

export class WorkflowTokenOutputSchema {
  @ApiProperty()
  token: string;
}
