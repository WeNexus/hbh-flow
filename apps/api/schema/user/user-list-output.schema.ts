import { ListOutputSchema } from '#lib/core/schema';
import { ApiProperty } from '@nestjs/swagger';
import { UserSchema } from './user.schema';

export class UserListOutputSchema extends ListOutputSchema {
  @ApiProperty({
    description: 'An array of user objects representing users in the system.',
    type: [UserSchema],
    example: [
      {
        id: 2,
        role: 'ADMIN',
        email: 'admin@example.com',
        name: 'Alice Admin',
        createdAt: '2023-10-01T12:00:00Z',
      },
      {
        id: 3,
        role: 'OBSERVER',
        email: 'user@example.com',
        name: 'Bob User',
        createdAt: '2023-10-02T09:15:00Z',
      },
    ],
  })
  data: UserSchema[];
}
