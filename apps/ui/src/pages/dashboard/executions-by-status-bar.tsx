import type { DashboardOutputSchema } from '@/types/schema.ts';
import CardContent from '@mui/material/CardContent';
import type { BarChartProps } from '@mui/x-charts';
import Typography from '@mui/material/Typography';
import { BarChart } from '@mui/x-charts/BarChart';
import { useTheme } from '@mui/material/styles';
import Stack from '@mui/material/Stack';
import Card from '@mui/material/Card';
import { useMemo } from 'react';

type Status = keyof DashboardOutputSchema['executions']['byStatusMonth'];

interface Props {
  data: DashboardOutputSchema['executions']['byStatusMonth'];
}

export default function ExecutionsByStatusBar({ data }: Props) {
  const theme = useTheme();

  const colorPalette = useMemo(
    () => [
      (theme.vars || theme).palette.success.light,
      (theme.vars || theme).palette.error.light,
    ],
    [theme],
  );

  const total = useMemo(() => {
    let sum = 0;

    for (const status in data) {
      if (!Object.prototype.hasOwnProperty.call(data, status)) {
        continue;
      }

      sum += data[status as Status]!.reduce(
        (sum, item) => sum + Number(item.count),
        0,
      );
    }

    return sum;
  }, [data]);

  const xAxis = useMemo<BarChartProps['xAxis']>(() => {
    const months = data.SUCCEEDED?.map((item) =>
      new Date(item.date).toLocaleString('default', { month: 'short' }),
    );

    return [
      {
        scaleType: 'band',
        categoryGapRatio: 0.5,
        data: months,
        height: 24,
      },
    ];
  }, [data.SUCCEEDED]);

  const series = useMemo<BarChartProps['series']>(() => {
    return [
      {
        id: 'success',
        label: 'Success',
        data: data.SUCCEEDED?.map((item) => Number(item.count)) ?? [],
        stack: 'A',
      },
      {
        id: 'failure',
        label: 'Failure',
        data: data.FAILED?.map((item) => Number(item.count)) ?? [],
        stack: 'A',
      },
    ];
  }, [data.FAILED, data.SUCCEEDED]);

  return (
    <Card variant="outlined" sx={{ width: '100%' }}>
      <CardContent>
        <Typography component="h2" variant="subtitle2" gutterBottom>
          Executions by Status
        </Typography>

        <Stack sx={{ justifyContent: 'space-between' }}>
          <Stack
            direction="row"
            sx={{
              alignContent: { xs: 'center', sm: 'flex-start' },
              alignItems: 'center',
              gap: 1,
            }}
          >
            <Typography variant="h4" component="p">
              {total}
            </Typography>
          </Stack>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Executions, successes and failures for the last 6 months
          </Typography>
        </Stack>

        <BarChart
          margin={{ left: 0, right: 0, top: 20, bottom: 0 }}
          grid={{ horizontal: true }}
          yAxis={[{ width: 50 }]}
          colors={colorPalette}
          borderRadius={8}
          series={series}
          xAxis={xAxis}
          height={250}
          hideLegend
        />
      </CardContent>
    </Card>
  );
}
