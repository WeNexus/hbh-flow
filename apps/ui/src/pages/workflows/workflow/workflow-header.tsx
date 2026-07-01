import type { WorkflowDetailSchema, JobSchema } from '@/types/schema.ts';
import { RunWorkflowDialog } from './run-workflow-dialog.tsx';
import { useDialog } from '@/hooks/use-dialog.ts';
import { useApi } from '@/hooks/use-api.ts';
import { useCallback } from 'react';

import {
  PlayArrowRounded as PlayIcon,
  ScheduleRounded as ScheduleIcon,
  PhishingRounded as EventIcon,
  WebhookRounded as WebhookIcon,
  BoltRounded as BoltIcon,
  LockRounded as LockIcon,
} from '@mui/icons-material';

import {
  Typography,
  Divider,
  Tooltip,
  Button,
  Stack,
  Chip,
  Card,
  Grid,
  Box,
} from '@mui/material';

export interface WorkflowHeaderProps {
  workflow: WorkflowDetailSchema;
  onRan?: (job: JobSchema) => void;
}

interface StatProps {
  label: string;
  value: number;
  color?: 'default' | 'primary' | 'success' | 'error' | 'warning' | 'info';
}

function Stat({ label, value, color = 'default' }: StatProps) {
  const palette =
    color === 'default' ? 'text.primary' : `${color}.main`;

  return (
    <Card
      variant="outlined"
      sx={{ px: 2, py: 1.5, height: '100%', textAlign: 'center' }}
    >
      <Typography variant="h5" sx={{ color: palette, fontWeight: 600 }}>
        {value.toLocaleString()}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Card>
  );
}

type Trigger = NonNullable<
  NonNullable<WorkflowDetailSchema['config']>['triggers']
>[number];

function triggerLabel(trigger: Trigger): {
  icon: React.ReactElement;
  label: string;
} {
  if (trigger.type === 'Cron') {
    return {
      icon: <ScheduleIcon fontSize="small" />,
      label: `${trigger.pattern}${trigger.timezone ? ` (${trigger.timezone})` : ''}`,
    };
  }

  const events = Array.isArray(trigger.event)
    ? trigger.event.join(', ')
    : trigger.event;

  return {
    icon: <EventIcon fontSize="small" />,
    label: [events, trigger.provider, trigger.connection]
      .filter(Boolean)
      .join(' · '),
  };
}

export function WorkflowHeader({ workflow, onRan }: WorkflowHeaderProps) {
  const { showDialog } = useDialog();
  const { api } = useApi();

  const openRunDialog = useCallback(() => {
    showDialog({
      props: { maxWidth: 'sm', fullWidth: true },
      render: () => <RunWorkflowDialog workflow={workflow} onRan={onRan} />,
    });
  }, [onRan, showDialog, workflow]);

  const config = workflow.config;
  const triggers = config?.triggers ?? [];

  return (
    <Card variant="outlined" sx={{ p: 2.5 }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            {workflow.name}
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontFamily: 'monospace' }}
          >
            {workflow.key}
          </Typography>

          <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap' }}>
            <Chip
              size="small"
              label={workflow.active ? 'Active' : 'Inactive'}
              color={workflow.active ? 'success' : 'default'}
              variant={workflow.active ? 'filled' : 'outlined'}
            />
            {workflow.paused && (
              <Chip size="small" label="Queue paused" color="warning" />
            )}
            {config?.webhook && (
              <Chip
                size="small"
                icon={<WebhookIcon />}
                label="Webhook"
                color="info"
                variant="outlined"
              />
            )}
            {config?.internal && (
              <Chip
                size="small"
                icon={<LockIcon />}
                label="Internal"
                variant="outlined"
              />
            )}
            <Chip
              size="small"
              icon={<BoltIcon />}
              label={`${workflow.steps.length} step${workflow.steps.length === 1 ? '' : 's'}`}
              variant="outlined"
            />
          </Stack>
        </Box>

        {api.isPowerUser && (
          <Button
            startIcon={<PlayIcon />}
            onClick={openRunDialog}
            variant="contained"
            sx={{ flexShrink: 0 }}
          >
            Run workflow
          </Button>
        )}
      </Stack>

      <Grid container spacing={1.5} sx={{ mt: 1.5 }}>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <Stat label="Total jobs" value={workflow.count} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <Stat label="Completed" value={workflow.completedCount} color="success" />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <Stat label="Failed" value={workflow.failedCount} color="error" />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <Stat label="Running" value={workflow.activeCount} color="primary" />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <Stat label="Waiting" value={workflow.waitingCount} color="warning" />
        </Grid>
      </Grid>

      {(config || triggers.length > 0) && (
        <>
          <Divider sx={{ my: 2 }} />

          <Stack
            direction="row"
            spacing={3}
            sx={{ flexWrap: 'wrap', rowGap: 1.5 }}
          >
            {config?.concurrency != null && (
              <MetaItem label="Concurrency" value={String(config.concurrency)} />
            )}
            {config?.maxRetries != null && (
              <MetaItem label="Max retries" value={String(config.maxRetries)} />
            )}
            {config?.limit && (
              <MetaItem
                label="Rate limit"
                value={`${config.limit.max} / ${config.limit.duration}ms`}
              />
            )}
            {config?.webhook && config?.webhookPayloadType && (
              <MetaItem
                label="Webhook payload"
                value={String(config.webhookPayloadType)}
              />
            )}
          </Stack>

          {triggers.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}
              >
                Triggers
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: 'wrap', gap: 1 }}>
                {triggers.map((t, i) => {
                  const { icon, label } = triggerLabel(t);
                  return (
                    <Tooltip title={t.type} key={i}>
                      <Chip size="small" icon={icon} label={label} variant="outlined" />
                    </Tooltip>
                  );
                })}
              </Stack>
            </Box>
          )}
        </>
      )}
    </Card>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 500 }}>
        {value}
      </Typography>
    </Box>
  );
}
