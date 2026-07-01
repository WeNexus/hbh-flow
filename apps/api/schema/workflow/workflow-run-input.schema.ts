import { IsJSON, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class WorkflowRunInputSchema {
  @ApiProperty({
    description:
      'The payload to pass to the workflow, encoded as a JSON string. This becomes the trigger data (`this.payload`) available to the workflow steps. If omitted, an empty payload is used.',
    required: false,
    example: '{"orderId":123,"action":"sync"}',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @IsJSON()
  payload?: string;

  @ApiProperty({
    description:
      'Optional initial context for the workflow run, encoded as a JSON string. Keep this small as it is stored in Redis.',
    required: false,
    example: '{"retry":false}',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @IsJSON()
  context?: string;
}
