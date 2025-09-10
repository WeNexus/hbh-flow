import type { GridApiCommunity } from '@mui/x-data-grid/internals';
import { type RefObject, useCallback } from 'react';

export function useGridUtils<R = any>(gridApi: RefObject<GridApiCommunity>) {
  const patchRows = useCallback(
    async (
      patcher: (
        key: string | number,
        row: R,
      ) => Promise<null | void> | null | void,
    ) => {
      const rowModels = gridApi.current.getRowModels();

      const rows: R[] = [];

      for (const [key, model] of rowModels) {
        const result = await patcher(key, model as R);

        if (result === null) {
          // Skip this row (delete)
          continue;
        }

        rows.push(model as R);
      }

      gridApi.current.setRows(rows as any);
    },
    [gridApi],
  );

  const patchRow = useCallback(
    async (
      id: string | number,
      patcher: (row: R) => Promise<null | void> | null | void,
    ) => {
      const rowModels = gridApi.current.getRowModels();

      const row = rowModels.get(id) as R | undefined;

      if (!row) {
        return;
      }

      const result = await patcher(row);
      const rows = gridApi.current.getSortedRows();

      if (result === null) {
        rows.splice(rows.indexOf(row), 1);
      }

      gridApi.current.setRows(rows);
    },
    [gridApi],
  );

  const addRow = useCallback(
    (row: R, position: 'end' | 'start' | number = 'end') => {
      const rows = gridApi.current.getSortedRows();

      if (position === 'end') {
        rows.push(row as any);
      } else if (position === 'start') {
        rows.unshift(row as any);
      } else {
        rows.splice(position, 0, row as any);
      }

      gridApi.current.setRows(rows as any);
    },
    [gridApi],
  );

  const refresh = useCallback(() => {
    const filterItems = gridApi.current.state.filter.filterModel.items.filter(
      (item) =>
        !(item.field.startsWith('$$internal__') && item.operator === ''),
    );

    gridApi.current.restoreState({
      ...gridApi.current.state,
      filter: {
        filterModel: {
          items: [
            {
              field: `$$internal__${Math.random()}`,
              operator: '',
            },
            ...filterItems,
          ],
        },
      },
    });
  }, [gridApi]);

  return {
    patchRows,
    patchRow,
    refresh,
    addRow,
  };
}
