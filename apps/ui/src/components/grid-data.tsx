import { SparkLineChart } from '@mui/x-charts/SparkLineChart';
import Avatar from '@mui/material/Avatar';
import Chip from '@mui/material/Chip';

import type {
  GridCellParams,
  GridRowsProp,
  GridColDef,
} from '@mui/x-data-grid';

type SparkLineData = number[];

function getDaysInMonth(month: number, year: number) {
  const date = new Date(year, month, 0);
  const monthName = date.toLocaleDateString('en-US', {
    month: 'short',
  });
  const daysInMonth = date.getDate();
  const days = [];
  let i = 1;
  while (days.length < daysInMonth) {
    days.push(`${monthName} ${i}`);
    i += 1;
  }
  return days;
}

function renderSparklineCell(params: GridCellParams<SparkLineData, any>) {
  const data = getDaysInMonth(4, 2024);
  const { value, colDef } = params;

  if (!value || value.length === 0) {
    return null;
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
      <SparkLineChart
        data={value}
        width={colDef.computedWidth || 100}
        height={32}
        plotType="bar"
        showHighlight
        showTooltip
        color="hsl(210, 98%, 42%)"
        xAxis={{
          scaleType: 'band',
          data,
        }}
      />
    </div>
  );
}

function renderStatus(status: 'Active' | 'Inactive') {
  const colors: { [index: string]: 'success' | 'default' } = {
    Active: 'success',
    Inactive: 'default',
  };

  return <Chip label={status} color={colors[status]} size="small" />;
}

export function renderAvatar(
  params: GridCellParams<{ name: string; color: string }, any, any>,
) {
  if (params.value == null) {
    return '';
  }

  return (
    <Avatar
      sx={{
        backgroundColor: params.value.color,
        width: '24px',
        height: '24px',
        fontSize: '0.85rem',
      }}
    >
      {params.value.name.toUpperCase().substring(0, 1)}
    </Avatar>
  );
}

export const columns: GridColDef[] = [
  { field: 'name', headerName: 'Workflow', flex: 1.5, minWidth: 200 },
  {
    field: 'status',
    headerName: 'Status',
    flex: 0.5,
    minWidth: 80,
    renderCell: (params) => renderStatus(params.value as 'Active' | 'Inactive'),
  },
  {
    field: 'executions',
    headerName: 'Executions',
    headerAlign: 'right',
    align: 'right',
    flex: 1,
    minWidth: 80,
  },
  {
    field: 'eventCount',
    headerName: 'Event Count',
    headerAlign: 'right',
    align: 'right',
    flex: 1,
    minWidth: 100,
  },
  {
    field: 'averageTime',
    headerName: 'Average Time',
    headerAlign: 'right',
    align: 'right',
    flex: 1,
    minWidth: 100,
  },
  {
    field: 'dailyExecutions',
    headerName: 'Daily Executions',
    flex: 1,
    minWidth: 150,
    renderCell: renderSparklineCell,
  },
];

export const rows: GridRowsProp = [
  {
    id: 1,
    name: 'Order Synchronization',
    status: 'Active',
    eventCount: 8345,
    executions: 212423,
    averageTime: '2m 15s',
    dailyExecutions: [
      469172, 488506, 592287, 617401, 640374, 632751, 668638, 807246, 749198,
      944863, 911787, 844815, 992022, 1143838, 1446926, 1267886, 1362511,
      1348746, 1560533, 1670690, 1695142, 1916613, 1823306, 1683646, 2025965,
      2529989, 3263473, 3296541, 3041524, 2599497,
    ],
  },
  {
    id: 2,
    name: 'Inventory Synchronization',
    status: 'Active',
    eventCount: 5653,
    executions: 172240,
    averageTime: '2m 30s',
    dailyExecutions: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 557488, 1341471, 2044561, 2206438,
    ],
  },
  {
    id: 3,
    name: 'Maintenance Workflow',
    status: 'Active',
    eventCount: 3455,
    executions: 58240,
    averageTime: '2m 10s',
    dailyExecutions: [
      166896, 190041, 248686, 226746, 261744, 271890, 332176, 381123, 396435,
      495620, 520278, 460839, 704158, 559134, 681089, 712384, 765381, 771374,
      851314, 907947, 903675, 1049642, 1003160, 881573, 1072283, 1139115,
      1382701, 1395655, 1355040, 1381571,
    ],
  },
];
