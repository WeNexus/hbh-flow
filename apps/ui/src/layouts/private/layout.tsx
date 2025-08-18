import { Outlet, useNavigate } from 'react-router';
import HeaderMobile from './header-mobile.tsx';
import { LoginForm } from '@/pages/login.tsx';
import { alpha } from '@mui/material/styles';
import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@/hooks/use-api.ts';
import Sidebar from './sidebar.tsx';
import Header from './header.tsx';

import {
  DialogContent,
  DialogTitle,
  Typography,
  Divider,
  Dialog,
  Stack,
  Alert,
  Box,
} from '@mui/material';

export function PrivateLayout() {
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const navigate = useNavigate();
  const { api, user } = useApi();

  const handleLoginDialogClose = useCallback(() => {
    setShowLoginDialog(false);

    if (api.isSessionExpired) {
      navigate('/login', { replace: true });
    }
  }, [api.isSessionExpired, navigate]);

  useEffect(() => {
    if (!api.user) {
      navigate('/login', { replace: true });
    }
  }, [api.user, navigate]);

  useEffect(() => {
    const handleSessionExpired = () => {
      setShowLoginDialog(true);
    };
    const handleLogin = () => {
      setShowLoginDialog(false);
    };

    api.events.addEventListener('session-expired', handleSessionExpired);
    api.events.addEventListener('login', handleLogin);

    return () => {
      api.events.removeEventListener('session-expired', handleSessionExpired);
      api.events.removeEventListener('login', handleLogin);
    };
  }, [api]);

  if (!user) {
    return <></>;
  }

  return (
    <Box sx={{ display: 'flex' }}>
      <Sidebar />
      <HeaderMobile />

      <Dialog onClose={handleLoginDialogClose} open={showLoginDialog}>
        <DialogTitle align="center">
          <Typography variant="h3" component="span">
            Login
          </Typography>

          <Divider sx={{ mt: 2 }} />
        </DialogTitle>

        <DialogContent>
          <Alert severity="warning" sx={{ mb: 3 }}>
            Your session has expired. Please log in again to continue.
          </Alert>

          <LoginForm />
        </DialogContent>
      </Dialog>

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
