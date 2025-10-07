import ExecutionsByStatusLine from '@/pages/dashboard/executions-by-status-line.tsx';
import ExecutionsByStatusBar from '@/pages/dashboard/executions-by-status-bar.tsx';
import ExecutionsByWorkflow from '@/pages/dashboard/executions-by-workflow.tsx';
import StatCard, { type StatCardProps } from '@/components/stat-card.tsx';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Skeleton, Grid, Box, Typography } from '@mui/material';
import type { DashboardOutputSchema } from '@/types/schema.ts';
import Workflows from '@/pages/dashboard/workflows.tsx';
import Copyright from '@/components/copyright.tsx';
import { useHeader } from '@/hooks/use-header.ts';
import { useSearchParams } from 'react-router';
import { useApi } from '@/hooks/use-api.ts';
import dayjs from 'dayjs';

function calculateTrend(data: number[]): StatCardProps['trend'] {
  if (data.length < 2) {
    return 'neutral';
  }

  const first = data[data.length - 2];
  const last = data[data.length - 1];

  if (last > first) {
    return 'up';
  } else if (last < first) {
    return 'down';
  } else {
    return 'neutral';
  }
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardOutputSchema | null>(null);
  const [searchParams] = useSearchParams();
  const { api } = useApi();

  const {
    UI: updateHeaderUI,
    state: headerState,
    setDate,
    setDate2,
  } = useHeader();

  const webhookHits = useMemo(() => {
    if (!data) {
      return null;
    }

    const items = data.executions?.byTriggerDay.WEBHOOK ?? [];
    const counts = items.map((d) => Number(d.count));

    return {
      data: counts,
      value: counts.reduce((a, b) => a + b, 0).toString(),
      trend: calculateTrend(counts),
      sentiment: 'neutral' as StatCardProps['sentiment'],
      labels: items.map((d) => new Date(d.date).toDateString()),
    };
  }, [data]);

  const executions = useMemo(() => {
    if (!data) {
      return null;
    }

    const items = data.executions.byDay;
    const counts = items.map((d) => Number(d.count));

    return {
      data: counts,
      value: counts.reduce((a, b) => a + b, 0).toString(),
      trend: calculateTrend(counts),
      sentiment: 'neutral' as StatCardProps['sentiment'],
      labels: items.map((d) => new Date(d.date).toDateString()),
    };
  }, [data]);

  const failedExecutions = useMemo(() => {
    if (!data) {
      return null;
    }

    const items = data.executions.byStatusDay.FAILED ?? [];
    const counts = items.map((d) => Number(d.count));
    const trend = calculateTrend(counts);
    const lastCount = counts[counts.length - 1] || 0;

    return {
      trend,
      data: counts,
      value: counts.reduce((a, b) => a + b, 0).toString(),
      sentiment: (trend === 'down' || lastCount === 0
        ? 'positive'
        : 'negative') as StatCardProps['sentiment'],
      labels: items.map((d) => new Date(d.date).toDateString()),
    };
  }, [data]);

  const successfulExecutions = useMemo(() => {
    if (!data) {
      return null;
    }

    const items = data.executions.byStatusDay.SUCCEEDED ?? [];
    const counts = items.map((d) => Number(d.count));
    const trend = calculateTrend(counts);

    return {
      trend,
      data: counts,
      value: counts.reduce((a, b) => a + b, 0).toString(),
      sentiment: (trend === 'down' &&
      (executions?.trend === 'neutral' || executions?.trend === 'up')
        ? 'negative'
        : 'positive') as StatCardProps['sentiment'],
      labels: items.map((d) => new Date(d.date).toDateString()),
    };
  }, [data, executions]);

  const fetchData = useCallback(
    (cb?: (data: DashboardOutputSchema) => any) => {
      const abortController = new AbortController();

      const showInternal = searchParams.get('showInternal');

      api
        .get<DashboardOutputSchema>('/dashboard', {
          signal: abortController.signal,
          params: {
            startDate: headerState.date?.toISOString(),
            endDate: headerState.date2?.toISOString(),
            hideInternal: !(
              showInternal === 'true' ||
              showInternal === '1' ||
              showInternal === 'yes'
            ),
          },
        })
        .then((res) => {
          setData(res.data);

          updateHeaderUI({
            loading: false,
          });

          if (cb) {
            cb(res.data);
          }
        })
        .catch((err) => {
          if (err.name !== 'CanceledError') {
            console.error(err);
          }
        });

      return () => {
        abortController.abort();
      };
    },
    [api, headerState.date, headerState.date2, searchParams, updateHeaderUI],
  );

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let cancelFetch: (() => void) | null = null;

    const doFetchData = () => {
      cancelFetch = fetchData(() => {
        timeoutId = setTimeout(doFetchData, 5000);
      });
    };

    doFetchData();

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (cancelFetch) {
        cancelFetch();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headerState.date]);

  useEffect(() => {
    updateHeaderUI({
      search: false,
      datePicker: true,
      dateRange: true,
      loading: !!data,
    });

    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    setDate(dayjs(new Date(new Date().setDate(new Date().getDate() - 30))));
    setDate2(dayjs(endDate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data) {
    return (
      <Box sx={{ width: '100%', maxWidth: { sm: '100%', md: '1700px' } }}>
        {/* cards */}
        <Typography component="h2" variant="h6" sx={{ mb: 2 }}>
          Overview
        </Typography>

        <Grid
          sx={{ mb: (theme) => theme.spacing(2) }}
          columns={12}
          spacing={2}
          container
        >
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <StatCard
              interval="Last 30 days"
              title="Webhook Hits"
              {...webhookHits!}
              loading={!data}
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <StatCard
              interval="Last 30 days"
              title="Executions"
              loading={!data}
              {...executions}
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <StatCard
              title="Successful Executions"
              interval="Last 30 days"
              loading={!data}
              {...successfulExecutions!}
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <StatCard
              title="Failed Executions"
              interval="Last 30 days"
              loading={!data}
              {...failedExecutions!}
            />
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Skeleton variant="rectangular" height={300} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Skeleton variant="rectangular" height={300} />
          </Grid>
        </Grid>

        <Typography component="h2" variant="h6" sx={{ mb: 2 }}>
          Workflows
        </Typography>

        <Grid container spacing={2} columns={12}>
          <Grid size={{ xs: 12, md: 9 }}>
            <Workflows data={[]} loading />
          </Grid>
          <Grid size={{ xs: 12, lg: 3 }}>
            <Skeleton variant="rectangular" height={600} />
          </Grid>
        </Grid>

        <Copyright sx={{ my: 4 }} />
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', maxWidth: { sm: '100%', md: '1700px' } }}>
      {/* cards */}
      <Typography component="h2" variant="h6" sx={{ mb: 2 }}>
        Overview
      </Typography>

      <Grid
        sx={{ mb: (theme) => theme.spacing(2) }}
        columns={12}
        spacing={2}
        container
      >
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard
            interval="Last 30 days"
            title="Webhook Hits"
            {...webhookHits!}
          />
        </Grid>

        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard
            interval="Last 30 days"
            title="Executions"
            {...executions!}
          />
        </Grid>

        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard
            title="Successful Executions"
            interval="Last 30 days"
            {...successfulExecutions!}
          />
        </Grid>

        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard
            title="Failed Executions"
            interval="Last 30 days"
            {...failedExecutions!}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <ExecutionsByStatusLine workflows={data.executions.workflows} />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <ExecutionsByStatusBar data={data.executions.byStatusMonth} />
        </Grid>
      </Grid>

      <Typography component="h2" variant="h6" sx={{ mb: 2 }}>
        Workflows
      </Typography>

      <Grid container spacing={2} columns={12}>
        <Grid size={{ xs: 12, md: 9 }}>
          <Workflows data={data.executions.workflows} />
        </Grid>
        <Grid size={{ xs: 12, lg: 3 }}>
          <ExecutionsByWorkflow
            workflows={data.executions.workflows}
            total={data.executions.total}
          />
        </Grid>
      </Grid>

      <Copyright sx={{ my: 4 }} />
    </Box>
  );
}
