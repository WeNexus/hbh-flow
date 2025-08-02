import { ApiProperty } from '@nestjs/swagger';

export class StepInfoSchema {
  @ApiProperty({
    description:
      'The name or identifier of the method to be executed in the step.',
    example: 'processOrder',
  })
  method: string;

  @ApiProperty({
    description:
      'The zero-based index representing the position of this step in the workflow sequence.',
    example: 0,
  })
  index: number;
}
