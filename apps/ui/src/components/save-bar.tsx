import type { useFormState } from '@/hooks/use-form-state.ts';
import { useHeader } from '@/hooks/use-header.ts';
import { useEffect } from 'react';

import {
  CardContent,
  ButtonGroup,
  Tooltip,
  Button,
  Stack,
  Card,
} from '@mui/material';

import {
  RestoreRounded as RestoreIcon,
  CheckRounded as SaveIcon,
  UndoRounded as UndoIcon,
  RedoRounded as RedoIcon,
} from '@mui/icons-material';

export interface SaveBarProps {
  formState: ReturnType<typeof useFormState<any>>;
  onSave: () => any;
  saving?: boolean;
}

export function SaveBar(props: SaveBarProps) {
  const { changes, cursor, isDirty, undo, redo, reset, history } =
    props.formState;

  const { loading } = useHeader();

  useEffect(() => loading(!!props.saving), [loading, props.saving]);

  return (
    <Card sx={{ position: 'sticky', bottom: 0, borderRadius: 4, mt: 3 }}>
      <CardContent
        justifyContent="space-between"
        alignItems="center"
        component={Stack}
        direction="row"
        spacing={2}
      >
        {history && (
          <ButtonGroup disabled={props.saving}>
            <Tooltip title="Undo changes">
              <Button onClick={undo} disabled={!isDirty}>
                <UndoIcon />
              </Button>
            </Tooltip>

            <Tooltip title="Redo changes">
              <Button
                disabled={
                  changes.length === 0 || cursor === changes.length - 1
                }
                onClick={redo}
              >
                <RedoIcon />
              </Button>
            </Tooltip>
          </ButtonGroup>
        )}

        <Stack direction="row" spacing={1} alignItems="center">
          <Button
            disabled={changes.length === 1 || props.saving}
            startIcon={<RestoreIcon />}
            variant="outlined"
            onClick={reset}
            color="error"
          >
            Reset
          </Button>

          <Button
            startIcon={<SaveIcon />}
            disabled={!isDirty || props.saving}
            onClick={props.onSave}
            variant="contained"
          >
            Save
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}
