import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class EventUpdateInputSchema {
  @ApiProperty({
    description: 'Specifies whether the event is currently active. Set to true to enable, or false to disable the event.',
    example: true,
    required: true,
  })
  @IsBoolean()
  active: boolean;
}
