import { useConfirmation } from '@/hooks/use-confirmation.tsx';
import { useGridUtils } from '@/hooks/use-grid-utils.ts';
import { useSnackbar } from '@/hooks/use-snackbar.ts';
import { useGridApiContext } from '@mui/x-data-grid';
import { FolderUpsert } from './folder-upsert.tsx';
import { useDialog } from '@/hooks/use-dialog.ts';
import { useCallback, useMemo } from 'react';
import { useApi } from '@/hooks/use-api.ts';
import type { Row } from './types.ts';
import { AxiosError } from 'axios';

import OptionsMenu, {
  type OptionsMenuProps,
} from '@/components/options-menu.tsx';

import type {
  WorkflowUpdateInputSchema,
  WorkflowBasicSchema,
  WorkflowSchema,
  FolderSchema,
} from '@/types/schema.ts';

import {
  DriveFileRenameOutlineOutlined as DriveFileRenameOutlineIcon,
  PauseCircleOutlined as PauseIcon,
  PlayArrowOutlined as PlayIcon,
  DeleteOutlined as DeleteIcon,
} from '@mui/icons-material';

export function OptionsCell({ row }: { row: Row }) {
  const showSnackbar = useSnackbar();
  const confirm = useConfirmation();
  const gridApi = useGridApiContext();
  const { refresh, patchRow } = useGridUtils<Row>(gridApi);
  const { showDialog } = useDialog();
  const { api } = useApi();

  const _delete = useCallback(
    async (id: number) => {
      const confirmed = await confirm({
        title: 'Are you sure?',
        message: 'This action cannot be undone!',
      });

      if (!confirmed) {
        return;
      }

      try {
        await api.delete(`/folders/${id}`);
        showSnackbar({ severity: 'success', message: 'Folder deleted' });
        refresh();
      } catch (e: unknown) {
        showSnackbar({
          severity: 'error',
          message:
            e instanceof AxiosError
              ? e.response?.data.message
              : 'Failed to delete folder',
        });
      }
    },
    [api, confirm, refresh, showSnackbar],
  );

  const rename = useCallback(async () => {
    showDialog(() => (
      <FolderUpsert folder={row.data as FolderSchema} gridApi={gridApi} />
    ));
  }, [gridApi, row.data, showDialog]);

  const toggleWorkflow = useCallback(
    async (id: number) => {
      try {
        const { data: workflow } = await api.patch<WorkflowBasicSchema>(
          `/workflows/${id}`,
          {
            active: !(row.data as WorkflowSchema).active,
          } as WorkflowUpdateInputSchema,
        );

        showSnackbar({
          severity: 'success',
          message: `Workflow ${workflow.active ? 'enabled' : 'disabled'}`,
        });

        await patchRow(`workflow-${id}`, (row) => {
          (row.data as WorkflowSchema).active = workflow.active;
        });
      } catch (e: unknown) {
        showSnackbar({
          severity: 'error',
          message:
            e instanceof AxiosError
              ? e.response?.data.message
              : 'Failed to update workflow',
        });
      }
    },
    [api, patchRow, row.data, showSnackbar],
  );

  const items = useMemo<OptionsMenuProps['items']>(() => {
    if (row.type === 'workflow') {
      return [
        {
          label: row.data.active ? 'Disable' : 'Enable',
          ctx: row.data.id,
          icon: row.data.active ? (
            <PauseIcon fontSize="small" />
          ) : (
            <PlayIcon fontSize="small" />
          ),
          onClick: toggleWorkflow,
        },
      ];
    }

    return [
      {
        label: 'Rename',
        icon: <DriveFileRenameOutlineIcon fontSize="small" />,
        onClick: rename,
      },
      {
        label: 'Delete',
        ctx: row.data.id,
        icon: <DeleteIcon fontSize="small" />,
        onClick: _delete,
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.type, (row.data as WorkflowSchema).active]);

  return <OptionsMenu items={items} />;
}
