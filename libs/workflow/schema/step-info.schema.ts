import { ApiProperty } from '@nestjs/swagger';

export class StepInfoSchema {
  @ApiProperty()
  method: string;

  @ApiProperty()
  index: number;
}
