import type { DashboardOutputSchema } from '@/types/schema.ts';
import { LineChart } from '@mui/x-charts/LineChart';
import type { LineChartProps } from '@mui/x-charts';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import Stack from '@mui/material/Stack';
import Card from '@mui/material/Card';
import { useMemo } from 'react';

interface ExecutionsByWorkflowProps {
  workflows: DashboardOutputSchema['executions']['workflows'];
}

function AreaGradient({ color, id }: { color: string; id: string }) {
  return (
    <defs>
      <linearGradient id={id} x1="50%" y1="0%" x2="50%" y2="100%">
        <stop offset="0%" stopColor={color} stopOpacity={0.5} />
        <stop offset="100%" stopColor={color} stopOpacity={0} />
      </linearGradient>
    </defs>
  );
}

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

export default function ExecutionsByStatusLine({
  workflows,
}: ExecutionsByWorkflowProps) {
  const theme = useTheme();

  const colorPalette = useMemo(
    () => [
      theme.palette.primary.light,
      theme.palette.primary.main,
      theme.palette.primary.dark,
    ],
    [
      theme.palette.primary.dark,
      theme.palette.primary.light,
      theme.palette.primary.main,
    ],
  );

  const xAxis = useMemo<LineChartProps['xAxis']>(() => {
    const date = new Date();
    const data =
      workflows.length === 0
        ? getDaysInMonth(date.getMonth() + 1, date.getFullYear())
        : workflows[0].dailyCounts.map((d) =>
            new Date(d.date).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            }),
          );

    return [
      {
        tickInterval: (_, i) => (i + 1) % 5 === 0,
        scaleType: 'point',
        height: 24,
        data,
      },
    ];
  }, [workflows]);

  const series = useMemo<LineChartProps['series']>(() => {
    return workflows.slice(0, 3).map((wf, index) => ({
      id: index === 0 ? 'first' : index === 1 ? 'second' : 'third',
      label: wf.name,
      showMark: false,
      curve: index === 0 ? 'natural' : 'linear',
      stack: 'total',
      area: true,
      stackOrder: 'ascending',
      data: wf.dailyCounts.map((d) => Number(d.count)),
    }));
  }, [workflows]);

  const total = useMemo(
    () =>
      workflows
        .slice(0, 3)
        .reduce(
          (acc, wf) =>
            acc +
            wf.dailyCounts.reduce(
              (dayAcc, day) => dayAcc + Number(day.count),
              0,
            ),
          0,
        )
        .toString(),
    [workflows],
  );

  return (
    <Card variant="outlined" sx={{ width: '100%' }}>
      <CardContent>
        <Typography component="h2" variant="subtitle2" gutterBottom>
          Top 3 Workflows by Executions over the Last 30 Days
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
            Executions per day for the last 30 days
          </Typography>
        </Stack>
        <LineChart
          margin={{ left: 0, right: 20, top: 20, bottom: 0 }}
          grid={{ horizontal: true }}
          yAxis={[{ width: 50 }]}
          colors={colorPalette}
          series={series}
          xAxis={xAxis}
          height={250}
          sx={{
            '& .MuiAreaElement-series-first': {
              fill: "url('#first')",
            },
            '& .MuiAreaElement-series-second': {
              fill: "url('#second')",
            },
            '& .MuiAreaElement-series-third': {
              fill: "url('#third')",
            },
          }}
          hideLegend
        >
          <AreaGradient color={theme.palette.primary.dark} id="first" />
          <AreaGradient color={theme.palette.primary.main} id="second" />
          <AreaGradient color={theme.palette.primary.light} id="third" />
        </LineChart>
      </CardContent>
    </Card>
  );
}
