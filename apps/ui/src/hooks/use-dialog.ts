import { createContext, type ReactNode, useContext } from 'react';
import type { DialogProps } from '@mui/material';

type RenderFN = () => ReactNode;

export type HideEvent = Parameters<Exclude<DialogProps['onClose'], undefined>>[0];
export type HideReason = 'backdropClick' | 'escapeKeyDown' | 'ok' | 'cancel' | 'other';

export interface DialogState {
  open: boolean;
  render?: RenderFN;
  onHide?: (event: HideEvent | null, reason: HideReason) => void;
  props?: Partial<Omit<DialogProps, 'open' | 'onClose' | 'children'>>;
}

export interface DialogContextType {
  showDialog: (stateOrRender: Omit<DialogState, 'open'> | RenderFN) => void;
  hideDialog: (
    event?: HideEvent | null,
    reason?: HideReason,
  ) => void;
}

export const DialogContext = createContext<DialogContextType | null>(null);

export function useDialog() {
  const context = useContext(DialogContext);

  if (!context) {
    throw new Error('useDialog must be used within a DialogProvider');
  }

  return context;
}
