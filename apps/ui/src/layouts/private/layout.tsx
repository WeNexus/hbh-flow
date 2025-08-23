import { HeaderContext, type HeaderState } from '@/hooks/use-header.ts';
import { useDebounceCallback } from '@/hooks/use-debounce-callback.ts';
import { Outlet, useNavigate, useSearchParams } from 'react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import HeaderMobile from './header-mobile.tsx';
import { LoginForm } from '@/pages/login.tsx';
import { alpha } from '@mui/material/styles';
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
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { api, user } = useApi();

  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLoginDialogClose = useCallback(() => {
    setShowLoginDialog(false);

    if (api.isSessionExpired) {
      navigate('/login', { replace: true });
    }
  }, [api.isSessionExpired, navigate]);

  const updateUI = useCallback((state: Partial<HeaderState>) => {
    setShowSearch((prev) => state.search ?? prev);
    setShowDatePicker((prev) => state.datePicker ?? prev);
    setLoading((prev) => state.loading ?? prev);
  }, []);

  const setQueryThrottled = useDebounceCallback(setQuery, 350);

  const submitQuery = useCallback((value: string) => {
    setQuery(value);

    if (value === '') {
      setSearchParams((prev) => {
        const newParams = new URLSearchParams(prev);
        newParams.delete('q');
        return newParams;
      });
    } else {
      setSearchParams((prev) => ({
        ...prev,
        q: value,
      }));
    }
  }, [setSearchParams]);

  const state = useMemo<HeaderState>(() => ({
    datePicker: showDatePicker,
    search: showSearch,
    loading,
    query,
  }), [showDatePicker, showSearch, loading, query]);

  const context = useMemo<HeaderContext>(
    () => ({
      state: state,
      loading: setLoading,
      setQuery: setQuery,
      setQueryThrottled,
      UI: updateUI,
      submitQuery,
    }),
    [setQueryThrottled, state, submitQuery, updateUI],
  );

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
          overflow: 'visible',
        })}
      >
        <Stack
          spacing={2}
          sx={{
            mt: { xs: 8, md: 0 },
            alignItems: 'center',
            mx: 3,
            pb: 5,
          }}
        >
          <HeaderContext value={context}>
            <Header />

            <Outlet />
          </HeaderContext>
        </Stack>
      </Box>
    </Box>
  );
}
