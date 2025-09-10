import type { GridColDef } from '@mui/x-data-grid';
import { Stack, Typography } from '@mui/material';
import { OptionsCell } from './options-cell.tsx';
import { StatusCell } from './status-cell.tsx';
import { type ReactNode } from 'react';
import type { Row } from './types.ts';

import {
  AccountTreeOutlined as AccountTreeIcon,
  PieChartOutline as PieChartIcon,
  CircleRounded as CircleIcon,
  FolderRounded as FolderIcon,
} from '@mui/icons-material';

function renderHeaderWithIcon(icon: ReactNode): GridColDef['renderHeader'] {
  return (params) => (
    <Stack
      justifyContent="center"
      alignItems="center"
      direction="row"
      gap={0.6}
    >
      {icon}

      <Typography variant="body2" fontWeight={600}>
        {params.colDef.headerName}
      </Typography>
    </Stack>
  );
}

export const columns: GridColDef<Row>[] = [
  {
    field: 'icon',
    headerName: '',
    flex: 1,
    align: 'right',
    sortable: false,
    filterable: false,
    type: 'string',
    width: 80,
    renderCell: ({ row }) =>
      row.type === 'folder' ? (
        <FolderIcon color="info" fontSize="large" />
      ) : (
        <CircleIcon
          color={row.data.active ? 'success' : 'disabled'}
          fontSize="small"
        />
      ),
  },
  {
    field: 'name',
    headerName: 'Name',
    flex: 1,
    align: 'left',
    sortable: false,
    filterable: false,
    type: 'string',
    renderCell: ({ row }) => row.data.name,
  },
  {
    field: 'children',
    headerName: 'Children',
    flex: 1,
    type: 'custom',
    headerAlign: 'center',
    align: 'center',
    sortable: false,
    filterable: false,
    renderHeader: renderHeaderWithIcon(<AccountTreeIcon fontSize="small" />),
    renderCell: ({ row }) =>
      row.type === 'workflow' ? '' : row.data.childrenCount,
  },
  {
    field: 'status',
    headerName: 'Status',
    flex: 1,
    type: 'string',
    headerAlign: 'center',
    align: 'center',
    sortable: false,
    filterable: false,
    renderHeader: renderHeaderWithIcon(<PieChartIcon fontSize="small" />),
    renderCell: ({ row }) =>
      row.type === 'folder' ? null : <StatusCell data={row.data} />,
  },
  {
    field: 'options',
    headerName: '',
    flex: 1,
    type: 'actions',
    align: 'right',
    sortable: false,
    filterable: false,
    renderCell: ({ row }) =>
      row.data.id === 0 ? null : <OptionsCell row={row} />,
  },
];
