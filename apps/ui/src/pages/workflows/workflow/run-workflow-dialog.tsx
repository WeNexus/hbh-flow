import type { WorkflowDetailSchema, JobSchema } from '@/types/schema.ts';
import { JsonField } from './json-field.tsx';
import { validateJson } from './json-util.ts';
import { useSnackbar } from '@/hooks/use-snackbar.ts';
import { useCallback, useMemo, useState } from 'react';
import { useDialog } from '@/hooks/use-dialog.ts';
import { useApi } from '@/hooks/use-api.ts';
import { AxiosError } from 'axios';

import {
  PlayArrowRounded as PlayIcon,
  ExpandMoreRounded as ExpandMoreIcon,
} from '@mui/icons-material';

import {
  AccordionSummary,
  AccordionDetails,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
  Accordion,
  Divider,
  Button,
  Stack,
} from '@mui/material';

export interface RunWorkflowDialogProps {
  workflow: WorkflowDetailSchema;
  onRan?: (job: JobSchema) => void;
}

export function RunWorkflowDialog({ workflow, onRan }: RunWorkflowDialogProps) {
  const [payload, setPayload] = useState('{}');
  const [context, setContext] = useState('');
  const [running, setRunning] = useState(false);
  const showSnackbar = useSnackbar();
  const { hideDialog } = useDialog();
  const { api } = useApi();

  const payloadError = useMemo(() => validateJson(payload), [payload]);
  const contextError = useMemo(() => validateJson(context), [context]);

  const run = useCallback(async () => {
    if (payloadError || contextError) {
      return;
    }

    setRunning(true);

    try {
      const { data } = await api.post<JobSchema>(
        `/workflows/${workflow.id}/run`,
        {
          payload: payload.trim() || undefined,
          context: context.trim() || undefined,
        },
      );

      showSnackbar({
        message: `Started job #${data.id}`,
        severity: 'success',
      });

      onRan?.(data);
      hideDialog();
    } catch (e: unknown) {
      showSnackbar({
        message:
          e instanceof AxiosError
            ? e.response?.data?.message || e.message
            : 'Failed to run workflow',
        severity: 'error',
      });
      setRunning(false);
    }
  }, [
    api,
    context,
    contextError,
    hideDialog,
    onRan,
    payload,
    payloadError,
    showSnackbar,
    workflow.id,
  ]);

  return (
    <>
      <DialogTitle>Run “{workflow.name}”</DialogTitle>

      <Divider />

      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Manually trigger this workflow with a custom payload. The payload is
            passed to the workflow as its trigger data.
          </Typography>

          <JsonField
            label="Payload (JSON)"
            value={payload}
            onChange={setPayload}
            error={payloadError}
            helperText="The data available to the workflow as this.payload."
            placeholder="{}"
          />

          <Accordion
            disableGutters
            elevation={0}
            sx={{ '&:before': { display: 'none' }, bgcolor: 'transparent' }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              sx={{ px: 0, minHeight: 0 }}
            >
              <Typography variant="body2">Advanced: initial context</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 0 }}>
              <JsonField
                label="Context (JSON)"
                value={context}
                onChange={setContext}
                error={contextError}
                helperText="Optional. Stored in Redis — keep it small."
                minRows={4}
                placeholder="Leave empty for none"
              />
            </AccordionDetails>
          </Accordion>
        </Stack>
      </DialogContent>

      <Divider />

      <DialogActions>
        <Button variant="outlined" color="inherit" onClick={hideDialog}>
          Cancel
        </Button>

        <Button
          startIcon={<PlayIcon />}
          disabled={running || Boolean(payloadError) || Boolean(contextError)}
          variant="contained"
          color="primary"
          onClick={run}
        >
          Run
        </Button>
      </DialogActions>
    </>
  );
}
