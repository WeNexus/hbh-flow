import type { DashboardOutputSchema } from '@/types/schema.ts';
import { formatDuration } from '@/modules/format-duration.ts';
import { SparkLineChart } from '@mui/x-charts/SparkLineChart';
import type { GridColDef } from '@mui/x-data-grid';
import Chip from '@mui/material/Chip';

type Row = DashboardOutputSchema['executions']['workflows'][number];

export const columns: GridColDef<Row>[] = [
  { field: 'name', headerName: 'Workflow', flex: 1.5, minWidth: 200 },
  {
    field: 'status',
    headerName: 'Status',
    flex: 0.5,
    minWidth: 80,
    renderCell({ row }) {
      return (
        <Chip
          label={row.active ? 'Active' : 'Inactive'}
          color={row.active ? 'success' : 'default'}
          size="small"
        />
      );
    },
  },
  {
    field: 'count',
    headerName: 'Executions',
    headerAlign: 'right',
    align: 'right',
    minWidth: 80,
    flex: 1,
  },
  {
    field: 'averageDuration',
    headerName: 'Average Duration',
    valueFormatter: (value) => {
      return formatDuration(Math.round(Number(value)));
    },
    headerAlign: 'right',
    align: 'right',
    flex: 1,
    minWidth: 100,
  },
  {
    field: 'dailyCounts',
    headerName: 'Daily Executions',
    flex: 1,
    minWidth: 150,
    align: 'center',
    headerAlign: 'center',
    renderCell({ row, colDef }) {
      const days = row.dailyCounts.map((d) => {
        const date = new Date(d.date);
        const month = date.toLocaleString('default', { month: 'short' });
        const day = date.getDate();
        return `${month} ${day}`;
      });

      return (
        <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <SparkLineChart
            data={row.dailyCounts.map((d) => Number(d.count))}
            width={colDef.computedWidth || 100}
            color="hsl(210, 98%, 42%)"
            plotType="bar"
            showHighlight
            height={32}
            showTooltip
            xAxis={{
              scaleType: 'band',
              data: days,
            }}
          />
        </div>
      );
    },
  },
];
