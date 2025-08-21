import { SnackbarContext, type SnackbarState } from '@/hooks/use-snackbar.ts';
import { PrivateLayout } from '@/layouts/private/layout.tsx';
import AppTheme from '@/components/theme/app-theme.tsx';
import { Connections } from '@/pages/connections.tsx';
import CssBaseline from '@mui/material/CssBaseline';
import { PublicLayout } from '@/layouts/public.tsx';
import { NotFound } from '@/pages/not-found.tsx';
import { Alert, Snackbar } from '@mui/material';
import Dashboard from '@/pages/dashboard.tsx';
import { Account } from '@/pages/account.tsx';
import { Route, Routes } from 'react-router';
import { useMemo, useState } from 'react';
import { Login } from '@/pages/login.tsx';
import { Users } from '@/pages/users.tsx';

export default function App(props: { disableCustomTheme?: boolean }) {
  const [snackbarState, setSnackbarState] = useState<SnackbarState>({
    open: false,
    severity: 'info',
    message: '',
    anchorOrigin: {
      vertical: 'bottom',
      horizontal: 'center',
    },
  });

  const snackbarContext = useMemo(
    () => ({
      showSnackbar: (state: Omit<SnackbarState, 'open'>) => {
        setSnackbarState((s) => ({
          ...s,
          ...state,
          open: true,
        }));
      },
    }),
    [],
  );

  return (
    <AppTheme {...props}>
      <CssBaseline enableColorScheme />

      <Snackbar
        onClose={() => setSnackbarState((s) => ({ ...s, open: false }))}
        anchorOrigin={snackbarState.anchorOrigin}
        open={snackbarState.open}
        autoHideDuration={4000}
      >
        <Alert
          onClose={() => setSnackbarState((s) => ({ ...s, open: false }))}
          severity={snackbarState.severity}
          sx={{ width: '100%' }}
        >
          {snackbarState.message}
        </Alert>
      </Snackbar>

      <SnackbarContext value={snackbarContext}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/login" element={<Login />} />
          </Route>

          <Route element={<PrivateLayout />}>
            <Route element={<Dashboard />} path="/" index />
            <Route element={<Account />} path="/account" />
            <Route element={<Connections />} path="/connections" />
            <Route element={<Users />} path="/users" />
            <Route element={<Account />} path="/users/:id?" />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </SnackbarContext>
    </AppTheme>
  );
}
