import { Outlet, useNavigate } from 'react-router';
import { useApi } from '@/hooks/use-api.ts';
import { useEffect } from 'react';

export function PublicLayout() {
  const navigate = useNavigate();
  const { api, user } = useApi();

  useEffect(() => {
    if (api.user) {
      navigate('/', { replace: true });
    }
  }, [api.user, navigate]);

  if (user) {
    return <></>;
  }

  return <Outlet />;
}
