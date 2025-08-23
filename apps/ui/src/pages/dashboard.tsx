import ChartExecutionsByWorkflow from '@/components/chart-executions-by-workflow';
import ExecutionsByTriggerChart from '@/components/executions-by-trigger-chart';
import ExecutionsByStatusChart from '@/components/executions-by-status-chart';
import StatCard, { type StatCardProps } from '@/components/stat-card';
import CustomizedTreeView from '@/components/customized-tree-view';
import CustomizedDataGrid from '@/components/customized-data-grid';
import Typography from '@mui/material/Typography';
import { useHeader } from '@/hooks/use-header.ts';
import Copyright from '@/components/copyright';
import Stack from '@mui/material/Stack';
import Grid from '@mui/material/Grid';
import Box from '@mui/material/Box';
import { useEffect } from 'react';

const data: StatCardProps[] = [
  {
    title: 'Webhook Hits',
    value: '200k',
    interval: 'Last 30 days',
    trend: 'neutral',
    sentiment: 'neutral',
    data: [
      500, 400, 510, 530, 520, 600, 530, 520, 510, 730, 520, 510, 530, 620, 510,
      530, 520, 410, 530, 520, 610, 530, 520, 610, 530, 420, 510, 430, 520, 510,
    ],
  },
  {
    title: 'Executions',
    value: '14k',
    interval: 'Last 30 days',
    trend: 'neutral',
    sentiment: 'neutral',
    data: [
      200, 24, 220, 260, 240, 380, 100, 240, 280, 240, 300, 340, 320, 360, 340,
      380, 360, 400, 380, 420, 400, 640, 340, 460, 440, 480, 460, 600, 880, 920,
    ],
  },
  {
    title: 'Successful Executions',
    value: '13.7k',
    interval: 'Last 30 days',
    trend: 'up',
    sentiment: 'positive',
    data: [
      200, 24, 220, 260, 240, 380, 100, 240, 280, 240, 300, 340, 320, 360, 340,
      380, 360, 400, 380, 420, 400, 640, 340, 460, 440, 480, 460, 600, 880, 920,
    ],
  },
  {
    title: 'Failed Executions',
    value: '325',
    interval: 'Last 30 days',
    trend: 'up',
    sentiment: 'negative',
    data: [
      1640, 1250, 970, 1130, 1050, 900, 720, 1080, 900, 450, 920, 820, 840, 600,
      820, 780, 800, 760, 380, 740, 660, 620, 840, 500, 520, 480, 400, 360, 300,
      220,
    ],
  },
];

export default function Dashboard() {
  const { UI: updateHeaderUI } = useHeader();

  useEffect(() => {
    updateHeaderUI({
      search: false,
      datePicker: true,
      loading: false,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Box sx={{ width: '100%', maxWidth: { sm: '100%', md: '1700px' } }}>
      {/* cards */}
      <Typography component="h2" variant="h6" sx={{ mb: 2 }}>
        Overview
      </Typography>
      <Grid
        container
        spacing={2}
        columns={12}
        sx={{ mb: (theme) => theme.spacing(2) }}
      >
        {data.map((card, index) => (
          <Grid key={index} size={{ xs: 12, sm: 6, lg: 3 }}>
            <StatCard {...card} />
          </Grid>
        ))}
        <Grid size={{ xs: 12, md: 6 }}>
          <ExecutionsByTriggerChart />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <ExecutionsByStatusChart />
        </Grid>
      </Grid>
      <Typography component="h2" variant="h6" sx={{ mb: 2 }}>
        Workflows
      </Typography>
      <Grid container spacing={2} columns={12}>
        <Grid size={{ xs: 12, lg: 9 }}>
          <CustomizedDataGrid />
        </Grid>
        <Grid size={{ xs: 12, lg: 3 }}>
          <Stack gap={2} direction={{ xs: 'column', sm: 'row', lg: 'column' }}>
            <CustomizedTreeView />
            <ChartExecutionsByWorkflow />
          </Stack>
        </Grid>
      </Grid>
      <Copyright sx={{ my: 4 }} />
    </Box>
  );
}
