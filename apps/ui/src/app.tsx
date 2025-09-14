import { SnackbarContext, type SnackbarState } from '@/hooks/use-snackbar.ts';
import { PrivateLayout } from '@/layouts/private/layout.tsx';
import AppTheme from '@/components/theme/app-theme.tsx';
import { useCallback, useMemo, useState } from 'react';
import { Workflows } from '@/pages/workflows/page.tsx';
import { Connections } from '@/pages/connections.tsx';
import CssBaseline from '@mui/material/CssBaseline';
import { PublicLayout } from '@/layouts/public.tsx';
import { Activities } from '@/pages/activities.tsx';
import { NotFound } from '@/pages/not-found.tsx';
import Dashboard from '@/pages/dashboard/page.tsx';
import { Account } from '@/pages/account.tsx';
import { Route, Routes } from 'react-router';
import { Login } from '@/pages/login.tsx';
import { Users } from '@/pages/users.tsx';

import {
  type DialogProps,
  Snackbar,
  Dialog,
  Alert,
} from '@mui/material';

import {
  type DialogContextType,
  type DialogState,
  DialogContext,
} from '@/hooks/use-dialog.ts';

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

  const [dialogState, setDialogState] = useState<DialogState>({
    open: false,
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

  const dialogContext = useMemo<DialogContextType>(
    () => ({
      showDialog: (stateOrRender) => {
        if (typeof stateOrRender === 'function') {
          setDialogState({
            open: true,
            render: stateOrRender as any,
          });
        } else {
          setDialogState({
            open: true,
            ...stateOrRender,
          });
        }
      },
      hideDialog: (event = null, reason = 'other') => {
        setDialogState((s) => {
          s.onHide?.(event, reason);

          return {
            open: false,
          };
        });
      },
    }),
    [],
  );

  const dialogContent = useMemo(
    () => (dialogState.render ? dialogState.render() : null),
    [dialogState],
  );

  const handleDialogClose = useCallback<
    Exclude<DialogProps['onClose'], undefined>
  >((event, reason) => {
    setDialogState((s) => {
      s.onHide?.(event, reason);

      return {
        open: false,
      };
    });
  }, []);

  const onSnackbarClose = useCallback(() => {
    setSnackbarState((s) => ({ ...s, open: false }));
  }, []);

  return (
    <AppTheme {...props}>
      <CssBaseline enableColorScheme />

      <Snackbar
        anchorOrigin={snackbarState.anchorOrigin}
        onClose={onSnackbarClose}
        open={snackbarState.open}
        autoHideDuration={4000}
      >
        <Alert
          severity={snackbarState.severity}
          onClose={onSnackbarClose}
          sx={{ width: '100%' }}
        >
          {snackbarState.message}
        </Alert>
      </Snackbar>

      <SnackbarContext value={snackbarContext}>
        <DialogContext value={dialogContext}>
          <Dialog open={dialogState.open} onClose={handleDialogClose} {...dialogState.props} children={dialogContent} />

          <Routes>
            <Route element={<PublicLayout />}>
              <Route path="/login" element={<Login />} />
            </Route>

            <Route element={<PrivateLayout />}>
              <Route element={<Dashboard />} path="/" index />
              <Route element={<Workflows />} path="/workflows/*" />
              <Route element={<Connections />} path="/connections" />
              <Route element={<Users />} path="/users" />
              <Route element={<Account />} path="/users/:id?" />
              <Route element={<Account />} path="/account" />
              <Route element={<Activities />} path="/activities" />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </DialogContext>
      </SnackbarContext>
    </AppTheme>
  );
}
