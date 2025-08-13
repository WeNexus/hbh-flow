import { Outlet, useNavigate } from 'react-router';
import HeaderMobile from './header-mobile.tsx';
import { alpha } from '@mui/material/styles';
import { useApi } from '@/hooks/use-api.ts';
import Stack from '@mui/material/Stack';
import Sidebar from './sidebar.tsx';
import Box from '@mui/material/Box';
import { useEffect } from 'react';
import Header from './header.tsx';

export function PrivateLayout() {
  const navigate = useNavigate();
  const { api, user } = useApi();

  useEffect(() => {
    if (!api.user) {
      navigate('/login', { replace: true });
    }
  }, [api.user, navigate]);

  if (!user) {
    return <></>;
  }

  return (
    <Box sx={{ display: 'flex' }}>
      <Sidebar />
      <HeaderMobile />

      <Box
        component="main"
        sx={(theme) => ({
          flexGrow: 1,
          backgroundColor: theme.vars
            ? `rgba(${theme.vars.palette.background.defaultChannel} / 1)`
            : alpha(theme.palette.background.default, 1),
          overflow: 'auto',
        })}
      >
        <Stack
          spacing={2}
          sx={{
            alignItems: 'center',
            mx: 3,
            pb: 5,
            mt: { xs: 8, md: 0 },
          }}
        >
          <Header />

          <Outlet />
        </Stack>
      </Box>
    </Box>
  );
}
