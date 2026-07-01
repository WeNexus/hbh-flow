import type { WorkflowDetailSchema } from '@/types/schema.ts';
import { JsonField } from './json-field.tsx';
import { validateJson } from './json-util.ts';
import { useSnackbar } from '@/hooks/use-snackbar.ts';
import { useCallback, useMemo, useState } from 'react';
import { useDialog } from '@/hooks/use-dialog.ts';
import { useApi } from '@/hooks/use-api.ts';
import { AxiosError } from 'axios';

import {
  ReplayRounded as ReplayIcon,
  ExpandMoreRounded as ExpandMoreIcon,
} from '@mui/icons-material';

import {
  AccordionSummary,
  AccordionDetails,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Typography,
  Accordion,
  InputLabel,
  MenuItem,
  Divider,
  Select,
  Button,
  Stack,
  Alert,
} from '@mui/material';

export interface ReplayDialogProps {
  jobId: number;
  steps: WorkflowDetailSchema['steps'];
  onReplayed?: () => void;
}

const START = '__start__';
const END = '__end__';

export function ReplayDialog({ jobId, steps, onReplayed }: ReplayDialogProps) {
  const [from, setFrom] = useState<string>(START);
  const [to, setTo] = useState<string>(END);
  const [context, setContext] = useState('');
  const [replaying, setReplaying] = useState(false);
  const showSnackbar = useSnackbar();
  const { hideDialog } = useDialog();
  const { api } = useApi();

  const ordered = useMemo(
    () => [...steps].sort((a, b) => a.index - b.index),
    [steps],
  );

  const contextError = useMemo(() => validateJson(context), [context]);

  // "from" must not come after "to".
  const rangeError = useMemo(() => {
    if (from === START || to === END) {
      return null;
    }

    const fromIdx = ordered.findIndex((s) => s.method === from);
    const toIdx = ordered.findIndex((s) => s.method === to);

    return fromIdx > toIdx ? '“From” step must come before “To” step.' : null;
  }, [from, ordered, to]);

  const replay = useCallback(async () => {
    if (contextError || rangeError) {
      return;
    }

    setReplaying(true);

    try {
      const { data } = await api.post<{ id: number }>(
        `/jobs/${jobId}/replay`,
        {
          from: from === START ? undefined : from,
          to: to === END ? undefined : to,
          context: context.trim() || undefined,
        },
      );

      showSnackbar({
        message: `Replay started as job #${data.id}`,
        severity: 'success',
      });

      onReplayed?.();
      hideDialog();
    } catch (e: unknown) {
      showSnackbar({
        message:
          e instanceof AxiosError
            ? e.response?.data?.message || e.message
            : 'Failed to replay job',
        severity: 'error',
      });
      setReplaying(false);
    }
  }, [
    api,
    context,
    contextError,
    from,
    hideDialog,
    jobId,
    onReplayed,
    rangeError,
    showSnackbar,
    to,
  ]);

  return (
    <>
      <DialogTitle>Replay job #{jobId}</DialogTitle>

      <Divider />

      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Re-run this job using its original payload. Optionally restrict the
            replay to a range of steps — results of steps before the “From” step
            are reused from the original run.
          </Typography>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <FormControl fullWidth size="small">
              <InputLabel id="replay-from">From step</InputLabel>
              <Select
                labelId="replay-from"
                label="From step"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              >
                <MenuItem value={START}>
                  <em>Beginning</em>
                </MenuItem>
                {ordered.map((s) => (
                  <MenuItem key={s.method} value={s.method}>
                    {s.method}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth size="small">
              <InputLabel id="replay-to">To step</InputLabel>
              <Select
                labelId="replay-to"
                label="To step"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              >
                <MenuItem value={END}>
                  <em>End</em>
                </MenuItem>
                {ordered.map((s) => (
                  <MenuItem key={s.method} value={s.method}>
                    {s.method}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>

          {rangeError && <Alert severity="error">{rangeError}</Alert>}

          <Accordion
            disableGutters
            elevation={0}
            sx={{ '&:before': { display: 'none' }, bgcolor: 'transparent' }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              sx={{ px: 0, minHeight: 0 }}
            >
              <Typography variant="body2">Advanced: override context</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 0 }}>
              <JsonField
                label="Context (JSON)"
                value={context}
                onChange={setContext}
                error={contextError}
                helperText="Optional. Overrides the context for the replayed run."
                minRows={4}
                placeholder="Leave empty to keep default"
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
          startIcon={<ReplayIcon />}
          disabled={replaying || Boolean(contextError) || Boolean(rangeError)}
          variant="contained"
          color="primary"
          onClick={replay}
        >
          Replay
        </Button>
      </DialogActions>
    </>
  );
}
