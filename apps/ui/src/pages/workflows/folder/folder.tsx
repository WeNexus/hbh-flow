import { CreateNewFolderRounded as CreateIcon } from '@mui/icons-material';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Theme, CSSProperties } from '@mui/material/styles';
import { type SxProps, Tooltip, Fab, Box } from '@mui/material';
import { FolderUpsert } from './folder-upsert.tsx';
import { ErrorState } from '@/components/error-state.tsx';
import type { Row, WorkflowsProps } from './types.ts';
import { useHeader } from '@/hooks/use-header.ts';
import { useDialog } from '@/hooks/use-dialog.ts';
import { CustomRow } from './custom-row.tsx';
import { useApi } from '@/hooks/use-api.ts';
import { useNavigate } from 'react-router';
import { columns } from './columns.tsx';
import { AxiosError } from 'axios';

import type {
  WorkflowListOutputSchema,
  FolderListOutputSchema,
  ListInputSchema,
} from '@/types/schema.ts';

import {
  type GridRowParams,
  type DataGridProps,
  useGridApiRef,
  DataGrid,
} from '@mui/x-data-grid';

import type {
  GridColumnVisibilityModel,
  GridDataSource,
} from '@mui/x-data-grid';

const getRowId = (row: Row) => `${row.type}-${row.data.id}`;

const getRowClassName: Exclude<DataGridProps['getRowClassName'], undefined> = (
  params,
) => (params.indexRelativeToCurrentPage % 2 === 0 ? 'even' : 'odd');

const tableStyle: SxProps<Theme> = {
  '& .odd': {
    bgcolor: (theme) => theme.palette.action.hover,
  },
  '& .MuiDataGrid-cell:focus': {
    outline: 'none',
  },
  '& .MuiDataGrid-row': {
    cursor: 'pointer',
  },
  '& .MuiDataGrid-row--dragOver': {
    border: (theme) => `1px dashed ${theme.palette.primary.main}`,
  },
  '& .MuiDataGrid-row--dragging': {
    opacity: 0.4,
  },
};

const slotProps: DataGridProps['slotProps'] = {
  filterPanel: {
    filterFormProps: {
      logicOperatorInputProps: {
        variant: 'outlined',
        size: 'small',
      },
      columnInputProps: {
        variant: 'outlined',
        size: 'small',
        sx: { mt: 'auto' },
      },
      operatorInputProps: {
        variant: 'outlined',
        size: 'small',
        sx: { mt: 'auto' },
      },
      valueInputProps: {
        InputComponentProps: {
          variant: 'outlined',
          size: 'small',
        },
      },
    },
  },
};

const slots: DataGridProps['slots'] = {
  row: CustomRow,
};

const autosizeOptions: DataGridProps['autosizeOptions'] = {
  expand: true,
};

const pageSizeOptions = [10, 20];

const fabStyle: CSSProperties = {
  position: 'fixed',
  bottom: 20,
  right: 20,
};

export function Folder(props: WorkflowsProps) {
  const apiRef = useGridApiRef();
  const navigate = useNavigate();
  const { UI: updateHeaderUI } = useHeader();
  const { showDialog } = useDialog();
  const { api } = useApi();

  const [error, setError] = useState<AxiosError | string | null>(null);

  const getRows = useCallback<GridDataSource['getRows']>(
    async (gridParams) => {
      try {
        const { paginationModel } = gridParams ?? {};

        const folderPageSize =
          paginationModel?.pageSize ?? props.defaultPageSize ?? 10;
        const folderPage = (paginationModel?.page ?? 0) + 1;

        const { data: folders } = await api.get<FolderListOutputSchema>(
          '/folders',
          {
            params: {
              page: folderPage, // API is 1-based, DataGrid is 0-based
              limit: folderPageSize,
              sortField: 'createdAt',
              sortOrder: gridParams.sortModel[0]?.sort ?? 'desc',
              filter: JSON.stringify({
                parentId: props.folderId,
              }),
            } as ListInputSchema,
          },
        );

        const workflowPage = Math.max(folderPage - folders.pages, 1);
        const workflowPageSize =
          folders.data.length < folderPageSize
            ? folderPageSize - folders.data.length
            : 0;

        const { data: workflows } = await api.get<WorkflowListOutputSchema>(
          '/workflows',
          {
            params: {
              page: workflowPage, // API is 1-based, DataGrid is 0-based
              limit: workflowPageSize,
              sortField: 'createdAt',
              sortOrder: gridParams.sortModel[0]?.sort ?? 'desc',
              filter: JSON.stringify({
                folderId: props.folderId,
              }),
            } as ListInputSchema,
          },
        );

        const folderRows: Row[] = (
          (props.folderId
            ? [
                {
                  type: 'folder',
                  data: {
                    id: 0,
                    name: '..',
                  },
                },
              ]
            : []) as Row[]
        ).concat(
          folders.data.map((f) => ({ type: 'folder', data: f }) satisfies Row),
        );

        const rows: Row[] =
          folderRows.length < folderPageSize
            ? folderRows
                .concat(
                  workflows.data.map(
                    (w) => ({ type: 'workflow', data: w }) satisfies Row,
                  ),
                )
                .slice(0, folderPageSize)
            : folderRows;

        return {
          rows,
          rowCount: folders.count + workflows.count,
          pageInfo: {
            hasNextPage: workflows.hasNext,
          },
        };
      } catch (e) {
        if (e instanceof AxiosError) {
          setError(e);
        }

        throw e; // Rethrow the error to be handled by the DataGrid
      }
    },
    [api, props.defaultPageSize, props.folderId],
  );

  const navigateToRow = useCallback(
    ({ row }: GridRowParams<Row>) => {
      if (row.type === 'folder' && row.data.id === 0) {
        return navigate('./..');
      }

      navigate(`./${row.data.name}__${row.type}_${row.data.id}`);
    },
    [navigate],
  );

  const showCreateFolderDialog = useCallback(
    () => showDialog(() => <FolderUpsert gridApi={apiRef as any} />),
    [apiRef, showDialog],
  );

  const dataSource = useMemo<DataGridProps['dataSource']>(
    () => ({ getRows }),
    [getRows],
  );

  const initialState: DataGridProps['initialState'] = useMemo(
    () => ({
      pagination: {
        paginationModel: { pageSize: props.defaultPageSize ?? 10 },
      },
    }),
    [props.defaultPageSize],
  );

  const wrapperStyle = useMemo<SxProps<Theme>>(
    () => ({
      px: props.embedded ? 0 : { xs: 1, sm: 2 },
      width: '100%',
      flexGrow: 1,
      mx: 'auto',
    }),
    [props.embedded],
  );

  const columnVisibilityModel = useMemo(
    () =>
      props.hideColumns?.reduce((model, col) => {
        model[col] = false;
        return model;
      }, {} as GridColumnVisibilityModel),
    [props.hideColumns],
  );

  useEffect(() => {
    updateHeaderUI({
      search: true,
      datePicker: false,
      loading: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <Box sx={wrapperStyle}>
        {/* Error */}
        {error ? (
          <ErrorState error={error} />
        ) : (
          <DataGrid
            columnVisibilityModel={columnVisibilityModel}
            autosizeOptions={autosizeOptions}
            getRowClassName={getRowClassName}
            onDataSourceError={console.error}
            pageSizeOptions={pageSizeOptions}
            initialState={initialState}
            onRowClick={navigateToRow}
            dataSource={dataSource}
            density="comfortable"
            slotProps={slotProps}
            rowSelection={false}
            sortingMode="server"
            filterMode="server"
            getRowId={getRowId}
            disableColumnMenu
            columns={columns}
            apiRef={apiRef}
            autosizeOnMount
            sx={tableStyle}
            slots={slots}
          />
        )}
      </Box>

      {api.isPowerUser && (
        <Tooltip title="Create folder" placement="left">
          <Fab
            onClick={showCreateFolderDialog}
            variant="circular"
            style={fabStyle}
            color="primary"
            size="large"
          >
            <CreateIcon />
          </Fab>
        </Tooltip>
      )}
    </>
  );
}
