import { createContext, useContext } from 'react';
import type { AlertProps } from '@mui/material';

export interface SnackbarState {
  open: boolean;
  severity?: AlertProps['severity'];
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
