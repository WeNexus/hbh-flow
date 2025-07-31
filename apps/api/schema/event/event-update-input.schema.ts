import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class EventUpdateInputSchema {
  @ApiProperty({
    description: 'Indicates if the event is active',
    required: true,
  })
  @IsBoolean()
  active: boolean;
}
