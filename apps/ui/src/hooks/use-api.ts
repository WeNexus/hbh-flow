import { useCallback, useEffect, useMemo, useState } from 'react';
import type { UserSchema } from '@/types/schema.ts';
import { Api } from '@/modules/api';

import type {
  UserUpdatedEvent,
  LogoutEvent,
  LoginEvent,
} from '@/modules/api/events.ts';

/**
 * Custom hook to manage API instance and user state.
 *
 * @returns {Object} An object containing the API instance and the current user.
 */
export function useApi() {
  const api = useMemo(() => new Api(), []);
  const [user, setUser] = useState<UserSchema | null>(api.user);
  const handleUserUpdate = useCallback(
    (event: LoginEvent | UserUpdatedEvent | LogoutEvent) => {
      setUser(event.detail);
    },
    [],
  );

  useEffect(() => {
    api.events.addEventListener('login', handleUserUpdate as EventListener);
    api.events.addEventListener(
      'user-updated',
      handleUserUpdate as EventListener,
    );
    api.events.addEventListener('logout', handleUserUpdate as EventListener);

    return () => {
      api.events.removeEventListener(
        'login',
        handleUserUpdate as EventListener,
      );
    };
  }, [api, handleUserUpdate]);

  return {
    user,
    api,
  };
}
