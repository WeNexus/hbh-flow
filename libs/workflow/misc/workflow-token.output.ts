import { ApiProperty } from '@nestjs/swagger';

export class WorkflowTokenOutput {
  @ApiProperty()
  token: string;
}
