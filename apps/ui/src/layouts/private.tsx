import { Outlet, useNavigate } from 'react-router';
import AppNavbar from '@/components/app-navbar';
import SideMenu from '@/components/side-menu';
import { alpha } from '@mui/material/styles';
import { useApi } from '@/hooks/use-api.ts';
import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';
import { useEffect } from 'react';

export function PrivateLayout() {
  const navigate = useNavigate();
  const { api, user } = useApi();

  useEffect(() => {
    if (!api.user) {
      console.log('User is not authenticated, redirecting to login');
      navigate('/login', { replace: true });
    }
  }, [api.user, navigate]);

  if (!user) {
    return <></>;
  }

  return (
    <Box sx={{ display: 'flex' }}>
      <SideMenu />
      <AppNavbar />
      {/* Main content */}
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
          <Outlet />
        </Stack>
      </Box>
    </Box>
  );
}
