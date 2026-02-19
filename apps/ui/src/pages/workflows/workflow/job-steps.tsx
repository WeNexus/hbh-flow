import { StepDuration } from '@/pages/workflows/workflow/step-duration.tsx';
import type { JobDetailSchema } from '@/types/schema.ts';
import { Typography, Box } from '@mui/material';

import {
  timelineItemClasses,
  TimelineConnector,
  TimelineSeparator,
  TimelineContent,
  TimelineItem,
  TimelineDot,
  Timeline,
} from '@mui/lab';

export interface JobStepsProps {
  job: JobDetailSchema;
  selected?: string | null;
  onSelect?: (step: string) => void;
}

export function JobSteps({
  job,
  selected = null,
  onSelect,
}: JobStepsProps) {
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
          {job.Steps.map((step, idx) => {
            const isLast = idx === job.Steps.length - 1;

            return (
              <TimelineItem
                key={step.name}
                sx={{
                  cursor: 'pointer',
                  backgroundColor:
                    selected === step.name ? 'action.selected' : 'transparent',
                  borderRadius: 1,
                  pl: 2,
                  '&:hover': {
                    backgroundColor: 'action.hover',
                  },
                }}
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
