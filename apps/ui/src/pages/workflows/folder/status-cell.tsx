import { PieChart, type PieSeries } from '@mui/x-charts';
import type { WorkflowSchema } from '@/types/schema.ts';
import { useMemo } from 'react';

const chartColors = ['hsl(110,63%,74%)', 'hsl(0,100%,82%)', 'hsl(217,23%,66%)'];
const chartMargin = {
  bottom: 0,
  right: 0,
  left: 0,
  top: 0,
};

export function StatusCell({ data }: { data: WorkflowSchema }) {
  const series = useMemo<PieSeries[]>(
    () => [
      {
        data: [
          {
            label: 'Success',
            value: data.completedCount,
          },
          {
            label: 'Failed',
            value: data.failedCount,
          },
          {
            label: 'Waiting or Running',
            value: data.waitingCount + data.activeCount,
          },
        ],
        innerRadius: 0,
        outerRadius: 26,
        cornerRadius: 3,
        highlightScope: { fade: 'global', highlight: 'item' },
      },
    ],
    [data],
  );

  return (
    <PieChart
      colors={chartColors}
      margin={chartMargin}
      series={series}
      hideLegend
    />
  );
}