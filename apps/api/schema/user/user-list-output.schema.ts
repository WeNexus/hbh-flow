import { ListOutputSchema } from '#lib/core/schema';
import { ApiProperty } from '@nestjs/swagger';
import { UserSchema } from './user.schema';

export class UserListOutputSchema extends ListOutputSchema {
  @ApiProperty({
    description: 'List of users',
    type: [UserSchema],
  })
  data: UserSchema[];
}
