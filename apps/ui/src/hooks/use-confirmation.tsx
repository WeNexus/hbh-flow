import { type DialogContextType, useDialog } from '@/hooks/use-dialog.ts';
import { useCallback, type MouseEvent } from 'react';

import {
  DialogContentText,
  DialogContent,
  DialogActions,
  DialogTitle,
  Button,
} from '@mui/material';

export interface ConfirmationState {
  title: string;
  message: string;
}

interface ConfirmationProps {
  state: ConfirmationState;
  hideDialog: DialogContextType['hideDialog'];
}

const Confirmation = ({ hideDialog, state }: ConfirmationProps) => {
  const cancel = useCallback(
    (e: MouseEvent) => hideDialog(e, 'cancel'),
    [hideDialog],
  );
  const confirm = useCallback(
    (e: MouseEvent) => hideDialog(e, 'ok'),
    [hideDialog],
  );

  return (
    <>
      <DialogTitle>{state.title || 'Are you sure?'}</DialogTitle>

      <DialogContent>
        <DialogContentText>
          {state.message || 'This action cannot be undone.'}
        </DialogContentText>
      </DialogContent>

      <DialogActions>
        <Button onClick={cancel} variant="outlined">
          Cancel
        </Button>

        <Button onClick={confirm} variant="contained" color="error">
          Confirm
        </Button>
      </DialogActions>
    </>
  );
};

export function useConfirmation() {
  const { showDialog, hideDialog } = useDialog();

  return useCallback(
    (state: ConfirmationState) => {
      return new Promise((resolve) => {
        showDialog({
          render: () => <Confirmation state={state} hideDialog={hideDialog} />,
          onHide: (_, reason) => resolve(reason === 'ok'),
        });
      });
    },
    [hideDialog, showDialog],
  );
}
