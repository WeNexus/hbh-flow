import { SparkLineChart } from '@mui/x-charts/SparkLineChart';
import { areaElementClasses } from '@mui/x-charts/LineChart';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import Stack from '@mui/material/Stack';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Box from '@mui/material/Box';
import { useMemo } from 'react';
import { Skeleton } from '@mui/material';

export type StatCardProps = {
  title: string;
  value?: string;
  interval: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
  trend?: 'up' | 'down' | 'neutral';
  data?: number[];
  labels?: string[];
  loading?: boolean;
};

function AreaGradient({ color, id }: { color: string; id: string }) {
  return (
    <defs>
      <linearGradient id={id} x1="50%" y1="0%" x2="50%" y2="100%">
        <stop offset="0%" stopColor={color} stopOpacity={0.3} />
        <stop offset="100%" stopColor={color} stopOpacity={0} />
      </linearGradient>
    </defs>
  );
}

export default function StatCard({
  loading = false,
  sentiment,
  interval,
  labels,
  title,
  value,
  trend,
  data,
}: StatCardProps) {
  const theme = useTheme();
  const sentimentColors = useMemo(
    () => ({
      positive:
        theme.palette.mode === 'light'
          ? theme.palette.success.main
          : theme.palette.success.dark,
      negative:
        theme.palette.mode === 'light'
          ? theme.palette.error.main
          : theme.palette.error.dark,
      neutral:
        theme.palette.mode === 'light'
          ? theme.palette.grey[400]
          : theme.palette.grey[700],
    }),
    [theme],
  );

  const labelColors = useMemo(
    () => ({
      positive: 'success' as const,
      negative: 'error' as const,
      neutral: 'default' as const,
    }),
    [],
  );

  const color = labelColors[sentiment ?? 'neutral'];
  const chartColor = sentimentColors[sentiment ?? 'neutral'];

  return (
    <Card variant="outlined" sx={{ height: '100%', flexGrow: 1 }}>
      <CardContent>
        <Typography component="h2" variant="subtitle2" gutterBottom>
          {title}
        </Typography>
        <Stack
          direction="column"
          sx={{ justifyContent: 'space-between', flexGrow: '1', gap: 1 }}
        >
          <Stack sx={{ justifyContent: 'space-between' }}>
            <Stack
              direction="row"
              sx={{ justifyContent: 'space-between', alignItems: 'center' }}
            >
              <Typography variant="h4" component="p">
                {value}
              </Typography>

              {!loading && sentiment !== 'neutral' && trend != 'neutral' && (
                <Chip
                  label={trend === 'down' ? '-' : '+'}
                  color={color}
                  size="small"
                />
              )}
            </Stack>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {interval}
            </Typography>
          </Stack>
          <Box sx={{ width: '100%', height: 50 }}>
            {!loading ? (
              <SparkLineChart
                color={chartColor}
                showHighlight
                data={data!}
                showTooltip
                area
                xAxis={{
                  scaleType: 'band',
                  data: labels, // Use the correct property 'data' for xAxis
                }}
                sx={{
                  [`& .${areaElementClasses.root}`]: {
                    fill: `url(#area-gradient-${value})`,
                  },
                }}
              >
                <AreaGradient
                  color={chartColor}
                  id={`area-gradient-${value}`}
                />
              </SparkLineChart>
            ) : (
              <Skeleton variant="rectangular" width="100%" height={50} />
            )}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}
