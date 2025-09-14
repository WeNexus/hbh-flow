import { DataGrid, type DataGridProps } from '@mui/x-data-grid';
import type { DashboardOutputSchema } from '@/types/schema.ts';
import { columns } from './grid-data.tsx';

interface WorkflowsProps {
  data: DashboardOutputSchema['executions']['workflows'];
  loading?: boolean;
}

const getRowClassName: DataGridProps['getRowClassName'] = (params) =>
  params.indexRelativeToCurrentPage % 2 === 0 ? 'even' : 'odd';

const initialState: DataGridProps['initialState'] = {
  pagination: { paginationModel: { pageSize: 20 } },
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

export default function Workflows({ data, loading = false }: WorkflowsProps) {
  return (
    <DataGrid
      getRowClassName={getRowClassName}
      pageSizeOptions={[10, 20, 50]}
      initialState={initialState}
      paginationMode="client"
      slotProps={slotProps}
      sortingMode="client"
      disableColumnResize
      disableColumnFilter
      loading={loading}
      disableColumnMenu
      columns={columns}
      checkboxSelection
      density="compact"
      rows={data}
    />
  );
}
