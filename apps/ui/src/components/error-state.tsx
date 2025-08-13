import SentimentDissatisfiedIcon from '@mui/icons-material/SentimentDissatisfied';
import { AxiosError, isAxiosError } from 'axios';
import * as React from 'react';

import {
  Typography,
  useTheme,
  Button,
  Paper,
  alpha,
  Stack,
  Box,
} from '@mui/material';

export interface ErrorStateProps {
  title?: string;
  description?: string;
  error?: Error | AxiosError | string;
  details?: string;
  onRetry?: () => void;
  supportAction?: React.ReactNode;
  dense?: boolean;
  maxWidth?: number | string;
}

function stringify(value: unknown): string {
  try {
    if (typeof value === 'string') return value;
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function deriveFromError(error?: Error | AxiosError | string): {
  code?: string | number;
  message?: string;
  details?: string;
} {
  if (!error) return {};
  // String errors
  if (typeof error === 'string') {
    return { message: error };
  }
  // Axios errors
  if (isAxiosError(error)) {
    const status = error.response?.status;
    const code = (status ?? error.code) as string | number | undefined;

    // Try to surface a helpful message:
    const serverMsg =
      // Common server shapes
      (error.response?.data as any)?.message ??
      (error.response?.data as any)?.error ??
      (error.response?.data as any)?.detail ??
      (error.response?.data as any)?.errors ??
      undefined;

    const message = serverMsg
      ? typeof serverMsg === 'string'
        ? serverMsg
        : stringify(serverMsg)
      : error.message;

    const details = [
      status ? `HTTP ${status}` : undefined,
      error.config?.method?.toUpperCase() && error.config?.url
        ? `${error.config.method.toUpperCase()} ${error.config.url}`
        : undefined,
      error.code ? `Code: ${error.code}` : undefined,
      error.stack ? `\nStack:\n${error.stack}` : undefined,
      error.response?.data && typeof error.response.data !== 'string'
        ? `\nResponse:\n${stringify(error.response.data)}`
        : error.response?.data
          ? `\nResponse:\n${error.response.data}`
          : undefined,
    ]
      .filter(Boolean)
      .join('\n');

    return { code, message, details };
  }
  // Native Error
  const native = error as Error;
  return {
    message: native.message,
    details: native.stack ?? native.message,
  };
}

export function ErrorState({
  title = 'Something went wrong',
  description = 'An unexpected error occurred. Please try again.',
  error,
  details,
  onRetry,
  supportAction,
  dense = false,
  maxWidth = 760,
}: ErrorStateProps) {
  const theme = useTheme();

  // Normalize incoming error to enrich defaults
  const derived = React.useMemo(() => deriveFromError(error), [error]);

  const effectiveDescription = derived.message ?? description;
  const effectiveDetails = details ?? derived.details;

  const iconSize = dense ? 44 : 56;

  return (
    <Stack spacing={2.5} sx={{ mx: 'auto', width: '100%', maxWidth }}>
      <Stack direction="row" spacing={2} alignItems="flex-start">
        <Paper
          elevation={0}
          sx={{
            p: 1.5,
            borderRadius: 2,
            border: 1,
            borderColor: 'divider',
            bgcolor:
              theme.palette.mode === 'light'
                ? 'error.lighter'
                : 'background.default',
            minWidth: iconSize + 12,
          }}
          aria-hidden
        >
          <Box
            sx={{
              width: iconSize,
              height: iconSize,
              borderRadius: 2,
              display: 'grid',
              placeItems: 'center',
              bgcolor: alpha(theme.palette.error.main, 0.12),
            }}
          >
            <SentimentDissatisfiedIcon fontSize="medium" />
          </Box>
        </Paper>

        <Stack spacing={1} flex={1} minWidth={0}>
          <Typography
            variant={dense ? 'h6' : 'h5'}
            fontWeight={800}
            sx={{ wordBreak: 'break-word' }}
          >
            {title}
          </Typography>

          {effectiveDescription && (
            <Typography
              variant="body1"
              color="text.secondary"
              sx={{ whiteSpace: 'pre-wrap' }}
              aria-live="polite"
            >
              {effectiveDescription}
            </Typography>
          )}

          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.25}
            sx={{ pt: 1, flexWrap: 'wrap' }}
          >
            {onRetry && (
              <Button
                variant="contained"
                onClick={onRetry}
                aria-label="Retry the last action"
              >
                Retry
              </Button>
            )}

            {supportAction}
          </Stack>
        </Stack>
      </Stack>

      {effectiveDetails && (
        <Paper
          variant="outlined"
          sx={{
            p: 2,
            borderRadius: 2.5,
            bgcolor:
              theme.palette.mode === 'light'
                ? alpha(theme.palette.background.paper, 0.8)
                : alpha(theme.palette.background.paper, 0.6),
          }}
        >
          <Typography
            variant="subtitle2"
            sx={{ mb: 0.5, fontWeight: 700 }}
            component="h3"
          >
            Technical details
          </Typography>
          <Box
            component="pre"
            sx={{
              m: 0,
              whiteSpace: 'pre-wrap',
              fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
              fontSize: 13,
              lineHeight: 1.6,
              maxHeight: 280,
              overflow: 'auto',
            }}
          >
            {effectiveDetails}
          </Box>
        </Paper>
      )}
    </Stack>
  );
}
