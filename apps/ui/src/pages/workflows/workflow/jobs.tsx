import type { JobListOutputSchema } from '@/types/schema.ts';
import OptionsMenu from '@/components/options-menu.tsx';
import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@/hooks/use-api.ts';
import { AxiosError } from 'axios';

import {
  HourglassBottomRounded as HourglassBottomIcon,
  PhishingRounded as PhishingRoundedIcon,
  NotStartedOutlined as ExecuteIcon,
  TouchAppRounded as TouchAppIcon,
  CheckCircleRounded as CheckIcon,
  ScheduleRounded as ScheduleIcon,
  PauseCircleRounded as PauseIcon,
  WebhookRounded as WebhookIcon,
  ReplayRounded as ReplayIcon,
  BlockRounded as BlockIcon,
  ErrorRounded as ErrorIcon,
  SyncRounded as SyncIcon,
} from '@mui/icons-material';

import {
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Pagination,
  ListItem,
  Skeleton,
  Stack,
  Chip,
  List,
  Box,
} from '@mui/material';

export interface JobsProps {
  workflowId: number;
  onSelect?: (jobId: number) => void;
  selectedJobId?: number | null;
}

export function Jobs({
  workflowId,
  onSelect,
  selectedJobId = null,
}: JobsProps) {
  const [res, setRes] = useState<JobListOutputSchema | null>(null);
  const [page, setPage] = useState(1);
  const { api } = useApi();

  const limit = 15;

  const load = useCallback(
    async (ac: AbortController, autoSelect = true) => {
      try {
        const { data } = await api.get<JobListOutputSchema>('/jobs', {
          signal: ac.signal,
          params: {
            page,
            limit,
            sortField: 'createdAt',
            sortOrder: 'desc',
            filter: JSON.stringify({ workflowId }),
          },
        });

        setRes(data);

        if (
          autoSelect &&
          data.data.length > 0 &&
          !data.data.some((job) => job.id === selectedJobId)
        ) {
          onSelect?.(data.data[0].id);
        }
      } catch (e) {
        if (e instanceof AxiosError) {
          console.log(
            `Error fetching jobs for workflow ${workflowId}:`,
            e.response?.data || e.message,
          );
        }
      }
    },
    [api, onSelect, page, selectedJobId, workflowId],
  );

  const replay = useCallback(
    async (id: string) => {
      await api.post(`/jobs/${id}/replay`);
      setTimeout(() => load(new AbortController(), false), 1000);
    },
    [api, load],
  );

  const execute = useCallback(
    async (id: string) => {
      await api.post(`/jobs/${id}/execute`);
      setTimeout(() => load(new AbortController(), false), 1000);
    },
    [api, load],
  );

  useEffect(() => {
    const ac = new AbortController();
    let timeout: any;

    const refresh = () => {
      if (page === 1) {
        load(ac, false).then(() => {
          timeout = setTimeout(refresh, 5000);
        });
      }
    };

    load(ac).then(() => {
      timeout = setTimeout(refresh, 5000);
    });

    return () => {
      clearTimeout(timeout);
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          borderRadius: 1,
          borderColor: 'divider',
          borderWidth: 1,
          borderStyle: 'solid',
        }}
      >
        <List dense>
          {res === null ? (
            Array(limit)
              .fill(0, 0, 14)
              .map((_, i) => (
                <Skeleton
                  variant="rounded"
                  sx={{ mb: 1 }}
                  height="40px"
                  width="100%"
                  key={i}
                />
              ))
          ) : res.data.length === 0 ? (
            <ListItem>
              <ListItemText primary="No jobs found" />
            </ListItem>
          ) : (
            res.data.map((job) => (
              <ListItem
                key={job.id}
                disablePadding
                secondaryAction={
                  job.status !== 'RUNNING' ? (
                    <OptionsMenu
                      items={[
                        {
                          label: 'Replay',
                          icon: <ReplayIcon fontSize="small" />,
                          ctx: job.id,
                          onClick: replay,
                          disabled:
                            job.status !== 'CANCELLED' &&
                            job.status !== 'FAILED' &&
                            job.status !== 'SUCCEEDED' &&
                            job.status !== 'STALLED',
                        },
                        {
                          label: 'Execute',
                          icon: <ExecuteIcon fontSize="small" />,
                          ctx: job.id,
                          onClick: execute,
                          disabled: job.status !== 'DRAFT',
                        },
                      ]}
                      title="Actions"
                      sx={{ ml: 'auto' }}
                    />
                  ) : null
                }
              >
                <ListItemButton
                  onClick={() => onSelect?.(job.id)}
                  selected={selectedJobId === job.id}
                >
                  <ListItemIcon>
                    {job.trigger === 'SCHEDULE' ? (
                      <ScheduleIcon
                        sx={(x) => ({ fill: x.palette.primary.main })}
                      />
                    ) : job.trigger === 'WEBHOOK' ? (
                      <WebhookIcon
                        sx={(x) => ({ fill: x.palette.info.main })}
                      />
                    ) : job.trigger === 'EVENT' ? (
                      <PhishingRoundedIcon
                        sx={(x) => ({ fill: x.palette.success.main })}
                      />
                    ) : (
                      <TouchAppIcon
                        sx={(x) => ({ fill: x.palette.warning.main })}
                      />
                    )}
                  </ListItemIcon>

                  <ListItemText
                    secondary={new Date(job.createdAt).toLocaleString()}
                    primary={
                      <>
                        #{job.id}{' '}
                        <Chip
                          label={job.status}
                          variant="outlined"
                          icon={
                            job.status === 'FAILED' ? (
                              <ErrorIcon />
                            ) : job.status === 'CANCELLED' ||
                              job.status === 'STALLED' ? (
                              <BlockIcon />
                            ) : job.status === 'SUCCEEDED' ? (
                              <CheckIcon />
                            ) : job.status === 'PAUSED' ? (
                              <PauseIcon />
                            ) : job.status === 'SCHEDULED' ||
                              job.status === 'DELAYED' ? (
                              <ScheduleIcon />
                            ) : job.status === 'RUNNING' ? (
                              <SyncIcon />
                            ) : (
                              <HourglassBottomIcon />
                            )
                          }
                          size="small"
                          color={
                            job.status === 'FAILED'
                              ? 'error'
                              : job.status === 'CANCELLED'
                                ? 'warning'
                                : job.status === 'SUCCEEDED'
                                  ? 'success'
                                  : 'primary'
                          }
                        />
                      </>
                    }
                  />
                </ListItemButton>
              </ListItem>
            ))
          )}
        </List>
      </Box>

      {res && res.count > limit && (
        <Stack direction="row" justifyContent="center" sx={{ mt: 1 }}>
          <Pagination
            onChange={(_, p) => setPage(p)}
            count={res.pages}
            shape="rounded"
            variant="text"
            size="small"
            page={page}
          />
        </Stack>
      )}
    </Box>
  );
}
