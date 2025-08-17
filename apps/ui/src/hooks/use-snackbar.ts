import type { AlertProps, SnackbarProps } from '@mui/material';
import { createContext, useContext } from 'react';

export interface SnackbarState {
  open: boolean;
  severity?: AlertProps['severity'];
  anchorOrigin?: SnackbarProps['anchorOrigin'];
  message: string;
}

export const SnackbarContext = createContext<{
  showSnackbar: (state: Omit<SnackbarState, 'open'>) => void;
} | null>(null);

export function useSnackbar() {
  const context = useContext(SnackbarContext);

  if (!context) {
    throw new Error('useSnackbar must be used within a SnackbarProvider');
  }

  return context.showSnackbar;
}
