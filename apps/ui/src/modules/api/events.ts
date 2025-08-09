import type { UserSchema } from '@/types/schema.ts';

export class LoginEvent extends CustomEvent<UserSchema> {
  constructor(user: UserSchema) {
    super('login', {
      detail: user,
      bubbles: true,
    });
  }
}

export class LogoutEvent extends CustomEvent<null> {
  constructor() {
    super('logout', {
      detail: null,
      bubbles: true,
    });
  }
}

export class UserUpdatedEvent extends CustomEvent<UserSchema> {
  constructor(user: UserSchema) {
    super('user-updated', {
      detail: user,
      bubbles: true,
    });
  }
}
