import { StepDuration } from '@/pages/workflows/workflow/step-duration.tsx';
import type { JobDetailSchema } from '@/types/schema.ts';
import { Typography, Box } from '@mui/material';

import {
  PhishingRounded as EventIcon,
  ScheduleRounded as ScheduleIcon,
  TouchAppRounded as ManualIcon,
  WebhookRounded as WebhookIcon,
  InputRounded as TriggerIcon,
} from '@mui/icons-material';

import {
  timelineItemClasses,
  TimelineConnector,
  TimelineSeparator,
  TimelineContent,
  TimelineItem,
  TimelineDot,
  Timeline,
} from '@mui/lab';

/** Sentinel step name for the synthetic trigger node. */
export const TRIGGER_STEP = '__trigger__';

export interface JobStepsProps {
  job: JobDetailSchema;
  selected?: string | null;
  onSelect?: (step: string) => void;
}

function triggerIcon(trigger: JobDetailSchema['trigger']) {
  switch (trigger) {
    case 'SCHEDULE':
      return <ScheduleIcon fontSize="small" />;
    case 'WEBHOOK':
      return <WebhookIcon fontSize="small" />;
    case 'EVENT':
      return <EventIcon fontSize="small" />;
    case 'MANUAL':
      return <ManualIcon fontSize="small" />;
    default:
      return <TriggerIcon fontSize="small" />;
  }
}

export function JobSteps({ job, selected = null, onSelect }: JobStepsProps) {
  const itemSx = (active: boolean) => ({
    cursor: 'pointer',
    backgroundColor: active ? 'action.selected' : 'transparent',
    borderRadius: 1,
    pl: 2,
    '&:hover': { backgroundColor: 'action.hover' },
  });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <Timeline
          sx={{
            [`& .${timelineItemClasses.root}:before`]: {
              flex: 0,
              padding: 0,
            },
          }}
        >
          {/* Synthetic trigger node — shows the job payload. */}
          <TimelineItem
            sx={itemSx(selected === TRIGGER_STEP)}
            onClick={() => onSelect?.(TRIGGER_STEP)}
          >
            <TimelineSeparator>
              <TimelineDot color="info">{triggerIcon(job.trigger)}</TimelineDot>
              {job.Steps.length > 0 && <TimelineConnector />}
            </TimelineSeparator>
            <TimelineContent>
              <Typography variant="body1">Trigger</Typography>
              <Typography variant="caption" color="text.secondary">
                {job.trigger} · payload
              </Typography>
            </TimelineContent>
          </TimelineItem>

          {job.Steps.map((step, idx) => {
            const isLast = idx === job.Steps.length - 1;

            return (
              <TimelineItem
                key={step.name}
                sx={itemSx(selected === step.name)}
                onClick={() => onSelect?.(step.name)}
              >
                <TimelineSeparator>
                  <TimelineDot
                    color={
                      step.status === 'SUCCEEDED'
                        ? 'success'
                        : step.status === 'FAILED'
                          ? 'error'
                          : 'primary'
                    }
                  />
                  {!isLast && <TimelineConnector />}
                </TimelineSeparator>
                <TimelineContent>
                  <Typography variant="body1">{step.name ?? 'Step'}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Duration:{' '}
                    <StepDuration
                      startDate={step.createdAt}
                      endDate={step.updatedAt}
                    />
                  </Typography>
                </TimelineContent>
              </TimelineItem>
            );
          })}
        </Timeline>
      </Box>
    </Box>
  );
}
