import { StepDuration } from '@/pages/workflows/workflow/step-duration.tsx';
import type { JobDetailSchema } from '@/types/schema.ts';
import ReactJsonView from '@microlink/react-json-view';
import { useColorScheme } from '@mui/material/styles';
import { isObject } from 'lodash-es';
import { useMemo } from 'react';

import {
  CheckCircleRounded as CheckIcon,
  HourglassBottomRounded as PendingIcon,
  ErrorRounded as ErrorIcon,
} from '@mui/icons-material';

import { Typography, Divider, Stack, Chip, Box } from '@mui/material';

interface Props {
  step: string;
  job: JobDetailSchema;
}

function statusChip(status: string) {
  if (status === 'SUCCEEDED') {
    return <Chip size="small" color="success" icon={<CheckIcon />} label={status} />;
  }
  if (status === 'FAILED') {
    return <Chip size="small" color="error" icon={<ErrorIcon />} label={status} />;
  }
  return <Chip size="small" color="primary" icon={<PendingIcon />} label={status} />;
}

function JsonBlock({
  title,
  data,
  dark,
}: {
  title: string;
  data: unknown;
  dark: boolean;
}) {
  return (
    <Box>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}
      >
        {title}
      </Typography>
      <Box sx={{ mt: 0.5 }}>
        {isObject(data) ? (
          <ReactJsonView
            displayDataTypes={false}
            enableClipboard
            name={false}
            collapsed={1}
            theme={dark ? 'ocean' : 'rjv-default'}
            style={{ backgroundColor: 'transparent', fontSize: 13 }}
            src={data as object}
          />
        ) : (
          <Typography
            variant="body2"
            sx={{ fontFamily: 'monospace', wordBreak: 'break-word' }}
          >
            {data === null || data === undefined ? '—' : String(data)}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

export function StepDetails(props: Props) {
  const { mode, systemMode } = useColorScheme();
  const dark = (mode === 'system' ? systemMode : mode) === 'dark';

  const step = useMemo(() => {
    return props.job.Steps.find((s) => s.name === props.step) || null;
  }, [props.job.Steps, props.step]);

  if (!step) {
    return (
      <Typography color="text.secondary" textAlign="center">
        Step not found.
      </Typography>
    );
  }

  return (
    <Stack spacing={1.5} sx={{ p: 0.5 }}>
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mr: 1 }}>
          {step.name}
        </Typography>
        {statusChip(step.status)}
      </Stack>

      <Stack direction="row" spacing={3} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
        <Meta label="Duration">
          <StepDuration startDate={step.createdAt} endDate={step.updatedAt} />
        </Meta>
        <Meta label="Runs">{step.runs}</Meta>
        <Meta label="Retries">{step.retries}</Meta>
      </Stack>

      <Divider />

      <JsonBlock title="Result" data={step.result} dark={dark} />

      {step.resume != null && (
        <JsonBlock title="Resume data" data={step.resume} dark={dark} />
      )}
    </Stack>
  );
}

function Meta({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 500 }}>
        {children}
      </Typography>
    </Box>
  );
}
