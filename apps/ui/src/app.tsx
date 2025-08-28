import { SnackbarContext, type SnackbarState } from '@/hooks/use-snackbar.ts';
import { PrivateLayout } from '@/layouts/private/layout.tsx';
import AppTheme from '@/components/theme/app-theme.tsx';
import { useCallback, useMemo, useState } from 'react';
import { Connections } from '@/pages/connections.tsx';
import CssBaseline from '@mui/material/CssBaseline';
import { PublicLayout } from '@/layouts/public.tsx';
import { Activities } from '@/pages/activities.tsx';
import { NotFound } from '@/pages/not-found.tsx';
import Dashboard from '@/pages/dashboard.tsx';
import { Account } from '@/pages/account.tsx';
import { Route, Routes } from 'react-router';
import { Login } from '@/pages/login.tsx';
import { Users } from '@/pages/users.tsx';

import {
  type ConfirmationState,
  ConfirmationContext,
} from '@/hooks/use-confirmation.ts';

import {
  DialogContentText,
  DialogActions,
  DialogContent,
  DialogTitle,
  Snackbar,
  Dialog,
  Alert,
  Button,
} from '@mui/material';

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

  const [confirmationState, setConfirmationState] = useState<ConfirmationState>(
    {
      open: false,
      title: '',
      message: '',
    },
  );

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

  const confirmationContext = useMemo(
    () => ({
      showConfirmation: (
        state: Omit<ConfirmationState, 'open' | 'callback'>,
      ) => {
        return new Promise<boolean>((resolve) => {
          setConfirmationState({
            ...state,
            open: true,
            callback: (confirmed: boolean) => {
              resolve(confirmed);
              setConfirmationState((s) => ({
                ...s,
                open: false,
                callback: undefined,
              }));
            },
          });
        });
      },
    }),
    [],
  );

  const onSnackbarClose = useCallback(() => {
    setSnackbarState((s) => ({ ...s, open: false }));
  }, []);

  const onConfirmationClose = useCallback(() => {
    setConfirmationState((s) => ({ ...s, open: false, callback: undefined }));
  }, []);

  const onConfirmationCancel = useCallback(() => {
    setConfirmationState((s) => {
      s.callback?.(false);

      return { ...s, open: false, callback: undefined };
    });
  }, []);

  const onConfirmationConfirm = useCallback(() => {
    setConfirmationState((s) => {
      s.callback?.(true);

      return { ...s, open: false, callback: undefined };
    });
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

      <Dialog onClose={onConfirmationClose} open={confirmationState.open}>
        <DialogTitle>{confirmationState.title || 'Are you sure?'}</DialogTitle>

        <DialogContent>
          <DialogContentText>
            {confirmationState.message || 'This action cannot be undone.'}
          </DialogContentText>
        </DialogContent>

        <DialogActions>
          <Button
            onClick={onConfirmationCancel}
            variant="outlined"
          >
            Cancel
          </Button>

          <Button
            onClick={onConfirmationConfirm}
            variant="contained"
            color="error"
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

      <SnackbarContext value={snackbarContext}>
        <ConfirmationContext value={confirmationContext}>
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
              <Route element={<Activities />} path="/activities" />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </ConfirmationContext>
      </SnackbarContext>
    </AppTheme>
  );
}
