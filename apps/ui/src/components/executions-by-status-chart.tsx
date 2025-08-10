import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import { BarChart } from '@mui/x-charts/BarChart';
import { useTheme } from '@mui/material/styles';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import Card from '@mui/material/Card';

export default function ExecutionsByStatusChart() {
  const theme = useTheme();
  const colorPalette = [
    (theme.vars || theme).palette.success.light,
    (theme.vars || theme).palette.error.light,
  ];
  return (
    <Card variant="outlined" sx={{ width: '100%' }}>
      <CardContent>
        <Typography component="h2" variant="subtitle2" gutterBottom>
          Executions by status
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
              1.3M
            </Typography>
            <Chip size="small" color="error" label="-8%" />
          </Stack>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Executions, successes and failures for the last 6 months
          </Typography>
        </Stack>
        <BarChart
          borderRadius={8}
          colors={colorPalette}
          xAxis={[
            {
              scaleType: 'band',
              categoryGapRatio: 0.5,
              data: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'],
              height: 24,
            },
          ]}
          yAxis={[{ width: 50 }]}
          series={[
            {
              id: 'success',
              label: 'Success',
              data: [2234, 3872, 2998, 4125, 3357, 2789, 2998],
              stack: 'A',
            },
            {
              id: 'failure',
              label: 'Failure',
              data: [3098, 4215, 2384, 2101, 4752, 3593, 2384],
              stack: 'A',
            },
          ]}
          height={250}
          margin={{ left: 0, right: 0, top: 20, bottom: 0 }}
          grid={{ horizontal: true }}
          hideLegend
        />
      </CardContent>
    </Card>
  );
}
