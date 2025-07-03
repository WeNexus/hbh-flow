import { ApiProperty } from '@nestjs/swagger';

export class StepInfo {
  @ApiProperty()
  method: string;

  @ApiProperty()
  index: number;
}
