import { useCallback, type DragEvent, useState } from 'react';
import { type GridRowProps, GridRow } from '@mui/x-data-grid';
import { useGridUtils } from '@/hooks/use-grid-utils.ts';
import { useSnackbar } from '@/hooks/use-snackbar.ts';
import { useGridApiContext } from '@mui/x-data-grid';
import { useApi } from '@/hooks/use-api.ts';
import type { Row } from './types.ts';
import { AxiosError } from 'axios';

function getRowElement(e: DragEvent<HTMLDivElement>) {
  let dropTarget: HTMLElement = e.currentTarget;

  if (!(dropTarget instanceof HTMLElement)) {
    return;
  }

  while (!dropTarget.classList.contains('MuiDataGrid-row')) {
    dropTarget = dropTarget.parentElement as HTMLElement;

    if (!dropTarget || dropTarget.tagName === 'BODY') {
      return;
    }
  }

  return dropTarget;
}

export function CustomRow(props: GridRowProps) {
  const showSnackbar = useSnackbar();
  const [dragStarted, setDragStarted] = useState(false);
  const { patchRows } = useGridUtils<Row>(useGridApiContext());
  const { api } = useApi();

  const row = props.row as Row;

  const onDragStart = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.dataTransfer.effectAllowed = 'move';

      e.dataTransfer.setData(
        'mui-x-data-grid/row',
        `${row.type}___${row.data.id}`,
      );

      setDragStarted(true);

      const target = getRowElement(e);

      if (target) {
        target.classList.add('MuiDataGrid-row--dragging');
      }
    },
    [row],
  );

  const onDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (dragStarted || row.type === 'workflow') {
        e.dataTransfer.dropEffect = 'none';
        return true;
      }

      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    },
    [dragStarted, row.type],
  );

  const onDragEnter = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      const quit = onDragOver(e);

      if (quit) {
        return;
      }

      const dropTarget = getRowElement(e);

      if (!dropTarget) {
        return;
      }

      if (e.type === 'dragleave') {
        dropTarget.classList.remove('MuiDataGrid-row--dragOver');
      } else {
        dropTarget.classList.add('MuiDataGrid-row--dragOver');
      }
    },
    [onDragOver],
  );

  const onDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>) => {
      const dropTarget = getRowElement(e);

      if (!dropTarget) {
        return;
      }

      dropTarget.classList.remove('MuiDataGrid-row--dragOver');

      const data = e.dataTransfer.getData('mui-x-data-grid/row');
      const [type, id] = data.split('___');

      try {
        await api.patch(`${type}s/${id}`, {
          [type === 'folder' ? 'parentId' : 'folderId']:
            row.data.id === 0 ? null : row.data.id,
        });

        showSnackbar({
          severity: 'success',
          message: `${type === 'folder' ? 'Folder' : 'Workflow'} moved successfully`,
        });

        await patchRows((key, model) => {
          if (key === `${type}-${id}`) {
            return null;
          }

          if (model === row && row.type === 'folder' && row.data.id !== 0) {
            row.data.childrenCount = row.data.childrenCount + 1;
          }
        });
      } catch (e: unknown) {
        console.error(e);
        showSnackbar({
          severity: 'error',
          message:
            e instanceof AxiosError
              ? e.response?.data.message
              : (e as any).toString(),
        });
      }
    },
    [api, patchRows, row, showSnackbar],
  );

  const onDragEnd = useCallback((e: DragEvent<HTMLDivElement>) => {
    setDragStarted(false);

    const target = getRowElement(e);

    if (target) {
      target.classList.remove('MuiDataGrid-row--dragging');
    }
  }, []);

  return (
    <GridRow
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDragLeave={onDragEnter}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDrop={onDrop}
      {...props}
      draggable
    />
  );
}
