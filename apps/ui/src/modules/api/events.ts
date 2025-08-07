import type { UserSchema } from '@/types/schema.ts';

export class LoginEvent extends CustomEvent<UserSchema> {
  constructor(user: UserSchema) {
    super('login', {
      detail: user,
      bubbles: true,
    });
  }
}

export class LogoutEvent extends CustomEvent<void> {
  constructor() {
    super('logout', {
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
