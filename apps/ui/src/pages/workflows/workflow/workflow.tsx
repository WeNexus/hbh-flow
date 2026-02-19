import {
  Typography,
  Skeleton,
  Divider,
  Stack,
  Grid,
  Box,
  Card,
} from '@mui/material';
import type { WorkflowDetailSchema, JobDetailSchema } from '@/types/schema.ts';
import { JobSteps } from '@/pages/workflows/workflow/job-steps.tsx';
import { Jobs } from '@/pages/workflows/workflow/jobs.tsx';
import { useHeader } from '@/hooks/use-header.ts';
import { useEffect, useState } from 'react';
import { useApi } from '@/hooks/use-api.ts';
import { StepDetails } from '@/pages/workflows/workflow/step-details.tsx';

export interface WorkflowProps {
  workflowId: number;
}

export function Workflow({ workflowId }: WorkflowProps) {
  const [workflow, setWorkflow] = useState<WorkflowDetailSchema | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [selectedStep, setSelectedStep] = useState<string | null>(null);
  const [job, setJob] = useState<JobDetailSchema | null>(null);
  const [jobLoading, setJobLoading] = useState(false);
  const { UI: updateHeaderUI } = useHeader();
  const { api } = useApi();

  useEffect(() => {
    updateHeaderUI({
      search: false,
      datePicker: false,
      loading: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const ac = new AbortController();

    (async () => {
      const res = await api.get<WorkflowDetailSchema>(
        `/workflows/${workflowId}/details`,
        { signal: ac.signal },
      );

      setWorkflow(res.data);
    })();

    return () => {
      ac.abort();
    };
  }, [api, workflowId]);

  useEffect(() => {
    if (!selectedJobId) {
      setJob(null);
      return;
    }

    const ac = new AbortController();
    setJobLoading(true);

    (async () => {
      try {
        const res = await api.get<JobDetailSchema>(`/jobs/${selectedJobId}`, {
          signal: ac.signal,
        });

        setJob(res.data);

        if (res.data.Steps.length > 0) {
          setSelectedStep(res.data.Steps[0].name);
        }
      } catch (e) {
        console.error(`Error fetching job ${selectedJobId}:`, e);

        setJob(null);
      } finally {
        setJobLoading(false);
      }
    })();

    return () => {
      ac.abort();
    };
  }, [api, selectedJobId]);

  // Reset step selection when job changes
  useEffect(() => {
    setSelectedStep(null);
  }, [selectedJobId]);

  return (
    <Box sx={{ width: '100%', maxWidth: { sm: '100%', md: '1700px' } }}>
      <Box sx={{ p: 2, mb: 2 }}>
        {!workflow ? (
          <Skeleton
            variant="rectangular"
            width="100%"
            height={250}
            sx={{ mt: 1 }}
          />
        ) : (
          JSON.stringify(workflow)
        )}
      </Box>

      <Grid
        sx={{ height: 'calc(100vh - 220px)' }}
        columns={12}
        spacing={2}
        container
      >
        {/* Left panel: Jobs list */}
        <Grid size={{ xs: 12, md: 4 }} sx={{ height: '100%' }}>
          <Jobs
            workflowId={workflowId}
            selectedJobId={selectedJobId}
            onSelect={(jobId) => setSelectedJobId(jobId)}
          />
        </Grid>

        {/* Right panel: Steps (top) + Step details (bottom) */}
        <Grid size={{ xs: 12, md: 8 }} sx={{ height: '100%' }}>
          <Stack direction="column" spacing={2} sx={{ height: '100%' }}>
            <Card
              sx={{
                flex: 1,
                overflow: 'auto',
                borderRadius: 1,
                borderColor: 'divider',
                borderWidth: 1,
                borderStyle: 'solid',
                p: 1,
              }}
            >
              {workflow && job ? (
                <JobSteps
                  onSelect={(step) => setSelectedStep(step)}
                  selected={selectedStep}
                  job={job}
                />
              ) : !jobLoading ? (
                <Typography color="text.secondary" textAlign="center">
                  No job selected.
                </Typography>
              ) : (
                <Skeleton
                  variant="rectangular"
                  sx={{ mt: 1 }}
                  width="100%"
                  height="90%"
                />
              )}
            </Card>

            <Divider />

            <Card
              sx={{
                flex: 1,
                overflow: 'auto',
                borderRadius: 1,
                borderColor: 'divider',
                borderWidth: 1,
                borderStyle: 'solid',
                p: 1,
              }}
            >
              {workflow && job && selectedStep ? (
                <StepDetails step={selectedStep} job={job} />
              ) : !jobLoading ? (
                <Typography color="text.secondary" textAlign="center">
                  No step selected.
                </Typography>
              ) : (
                <Skeleton
                  variant="rectangular"
                  sx={{ mt: 1 }}
                  width="100%"
                  height="90%"
                />
              )}
            </Card>
          </Stack>
        </Grid>
      </Grid>
    </Box>
  );
}
