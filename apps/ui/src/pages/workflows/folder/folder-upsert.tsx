import type { GridApiCommunity } from '@mui/x-data-grid/internals';
import { useGridUtils } from '@/hooks/use-grid-utils.ts';
import type { FolderSchema } from '@/types/schema.ts';
import { useSnackbar } from '@/hooks/use-snackbar.ts';
import { useDialog } from '@/hooks/use-dialog.ts';
import { useApi } from '@/hooks/use-api.ts';
import { useLocation } from 'react-router';
import type { Row } from './types.ts';
import { AxiosError } from 'axios';

import {
  type KeyboardEvent,
  type ChangeEvent,
  type RefObject,
  useCallback,
  useState,
} from 'react';

import {
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Divider,
  Button,
} from '@mui/material';

export function FolderUpsert({
  folder,
  gridApi,
}: {
  folder?: FolderSchema;
  gridApi: RefObject<GridApiCommunity>;
}) {
  const showSnackbar = useSnackbar();
  const { patchRow, addRow } = useGridUtils<Row>(gridApi);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(folder?.name ?? '');
  const pathname = useLocation().pathname;
  const { hideDialog } = useDialog();
  const { api } = useApi();

  const onChange = useCallback(
    (e: ChangeEvent) => setName((e.target as HTMLInputElement).value),
    [],
  );

  const save = useCallback(async () => {
    setSaving(true);

    try {
      const parentId = Number(pathname?.split('/').pop()?.split('_').pop());

      const res = await api.request<FolderSchema>({
        method: folder ? 'PATCH' : 'POST',
        url: folder ? `/folders/${folder.id}` : '/folders',
        data: {
          name: name.trim(),
          parentId: !folder && parentId ? Number(parentId) : undefined,
        },
      });

      if (!folder) {
        addRow(
          {
            type: 'folder',
            data: res.data,
          },
          parentId ? 1 : 'start',
        );
      } else {
        await patchRow(`folder-${res.data.id}`, (row) => {
          row.data.name = res.data.name;
        });
      }

      showSnackbar({
        message: folder ? 'Folder renamed' : 'Folder created',
        severity: 'success',
      });
    } catch (e: unknown) {
      showSnackbar({
        message:
          e instanceof AxiosError
            ? e.response?.data?.message
            : 'Failed to save folder',
        severity: 'error',
      });
    }

    hideDialog();
  }, [addRow, api, folder, hideDialog, name, pathname, patchRow, showSnackbar]);

  const onEnterKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        return save();
      }
    },
    [save],
  );

  return (
    <>
      <DialogTitle>{folder ? 'Rename' : 'Create'} folder</DialogTitle>

      <Divider />

      <DialogContent>
        <TextField
          onKeyDown={onEnterKey}
          onChange={onChange}
          label="Name"
          value={name}
        />
      </DialogContent>

      <Divider />

      <DialogActions>
        <Button variant="outlined" color="error" onClick={hideDialog}>
          Cancel
        </Button>

        <Button
          disabled={!name.trim() || saving}
          variant="contained"
          color="primary"
          onClick={save}
        >
          Save
        </Button>
      </DialogActions>
    </>
  );
}
