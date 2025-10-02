import { useDrawingArea } from '@mui/x-charts/hooks';
import CardContent from '@mui/material/CardContent';
import { PieChart } from '@mui/x-charts/PieChart';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';
import Stack from '@mui/material/Stack';
import Card from '@mui/material/Card';
import Box from '@mui/material/Box';
import * as React from 'react';
import { useMemo } from 'react';

import LinearProgress, {
  linearProgressClasses,
} from '@mui/material/LinearProgress';
import type { DashboardOutputSchema } from '@/types/schema.ts';

interface StyledTextProps {
  variant: 'primary' | 'secondary';
}

interface PieCenterLabelProps {
  primaryText: string;
  secondaryText: string;
}

interface ExecutionsByWorkflowProps {
  workflows: DashboardOutputSchema['executions']['workflows'];
  total: number | string;
}

const StyledText = styled('text', {
  shouldForwardProp: (prop) => prop !== 'variant',
})<StyledTextProps>(({ theme }) => ({
  textAnchor: 'middle',
  dominantBaseline: 'central',
  fill: (theme.vars || theme).palette.text.secondary,
  variants: [
    {
      props: {
        variant: 'primary',
      },
      style: {
        fontSize: theme.typography.h5.fontSize,
      },
    },
    {
      props: ({ variant }) => variant !== 'primary',
      style: {
        fontSize: theme.typography.body2.fontSize,
      },
    },
    {
      props: {
        variant: 'primary',
      },
      style: {
        fontWeight: theme.typography.h5.fontWeight,
      },
    },
    {
      props: ({ variant }) => variant !== 'primary',
      style: {
        fontWeight: theme.typography.body2.fontWeight,
      },
    },
  ],
}));

function PieCenterLabel({ primaryText, secondaryText }: PieCenterLabelProps) {
  const { width, height, left, top } = useDrawingArea();
  const primaryY = top + height / 2 - 10;
  const secondaryY = primaryY + 24;

  return (
    <React.Fragment>
      <StyledText variant="primary" x={left + width / 2} y={primaryY}>
        {primaryText}
      </StyledText>
      <StyledText variant="secondary" x={left + width / 2} y={secondaryY}>
        {secondaryText}
      </StyledText>
    </React.Fragment>
  );
}

const colors = [
  'hsl(220, 20%, 65%)',
  'hsl(220, 20%, 42%)',
  'hsl(220, 20%, 35%)',
  'hsl(220, 20%, 25%)',
];

export default function ExecutionsByWorkflow({
  workflows,
}: ExecutionsByWorkflowProps) {
  const _workflows = useMemo(
    () => workflows.slice(1, 6).filter((wf) => Number(wf.count) > 0),
    [workflows],
  );

  const total = useMemo(
    () => _workflows.reduce((acc, wf) => acc + Number(wf.count), 0),
    [_workflows],
  );

  const data = useMemo(() => {
    return _workflows.map((wf) => ({
      label: wf.name,
      value: Math.round((Number(wf.count) / total) * 100),
    }));
  }, [_workflows, total]);

  return (
    <Card
      variant="outlined"
      sx={{ display: 'flex', flexDirection: 'column', gap: '8px', flexGrow: 1 }}
    >
      <CardContent>
        <Typography component="h2" variant="subtitle2">
          Top 5 Workflows by Executions
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <PieChart
            margin={{
              left: 80,
              right: 80,
              top: 80,
              bottom: 80,
            }}
            series={[
              {
                data,
                innerRadius: 75,
                outerRadius: 100,
                paddingAngle: 0,
                highlightScope: { fade: 'global', highlight: 'item' },
              },
            ]}
            colors={colors}
            height={260}
            width={260}
            hideLegend
          >
            <PieCenterLabel
              primaryText={total.toString()}
              secondaryText="Total"
            />
          </PieChart>
        </Box>
        {data.map((item, index) => (
          <Stack
            sx={{ alignItems: 'center', gap: 2, pb: 2 }}
            key={index}
            direction="row"
          >
            <Stack sx={{ gap: 1, flexGrow: 1 }}>
              <Stack
                direction="row"
                sx={{
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 2,
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: '500' }}>
                  {item.label}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {item.value}%
                </Typography>
              </Stack>
              <LinearProgress
                variant="determinate"
                aria-label="Number of executions by workflow"
                value={item.value}
                sx={{
                  [`& .${linearProgressClasses.bar}`]: {
                    backgroundColor: 'hsl(220, 25%, 45%)',
                  },
                }}
              />
            </Stack>
          </Stack>
        ))}
      </CardContent>
    </Card>
  );
}
