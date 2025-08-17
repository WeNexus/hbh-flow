import type { useFormState } from '@/hooks/use-form-state.ts';

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
  UndoRounded as UndoIcon,
  RedoRounded as RedoIcon,
  SaveRounded as SaveIcon,
} from '@mui/icons-material';

export interface SaveBarProps {
  formState: ReturnType<typeof useFormState<any>>;
  onSave: () => any;
  saving?: boolean;
}

export function SaveBar(props: SaveBarProps) {
  const { changes, cursor, isDirty, undo, redo, reset, history } =
    props.formState;

  return (
    <Card
      sx={{ top: 'auto', bottom: 0, zIndex: 44000, borderRadius: 4, mt: 3 }}
    >
      <CardContent
        justifyContent={history ? 'space-between' : 'flex-end'}
        alignItems="center"
        component={Stack}
        direction="row"
        spacing={2}
      >
        {history && (
          <ButtonGroup>
            <Tooltip title="Undo changes">
              <Button onClick={undo} disabled={!isDirty}>
                <UndoIcon />
              </Button>
            </Tooltip>

            <Tooltip title="Redo changes">
              <Button
                disabled={changes.length === 0 || cursor === changes.length - 1}
                onClick={redo}
              >
                <RedoIcon />
              </Button>
            </Tooltip>
          </ButtonGroup>
        )}

        <Stack direction="row" spacing={1} alignItems="center">
          <Button
            disabled={changes.length === 1}
            startIcon={<RestoreIcon />}
            variant="outlined"
            onClick={reset}
            color="error"
          >
            Reset
          </Button>

          <Button
            startIcon={<SaveIcon />}
            onClick={props.onSave}
            disabled={!isDirty}
            variant="contained"
            loading={true}
          >
            Save
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}
