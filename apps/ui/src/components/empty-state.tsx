import { InboxOutlined as InboxIcon } from '@mui/icons-material';
import * as React from 'react';

import {
  Typography,
  useTheme,
  Paper,
  Stack,
  Chip,
  Box,
} from '@mui/material';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  primaryAction?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  tips?: string[];
  dense?: boolean;
  maxWidth?: number | string;
}

export function EmptyState({
  icon = <InboxIcon sx={{ fontSize: 36 }} />,
  title = 'Nothing here yet',
  description = 'When you add content, it will show up here.',
  primaryAction,
  secondaryAction,
  tips,
  dense = false,
  maxWidth = 560,
}: EmptyStateProps) {
  const theme = useTheme();
  return (
    <Stack
      alignItems="center"
      spacing={dense ? 1.75 : 2.5}
      sx={{ textAlign: 'center', maxWidth, mx: 'auto' }}
    >
      <Paper
        elevation={0}
        sx={{
          p: 2,
          borderRadius: 3,
          bgcolor:
            theme.palette.mode === 'light'
              ? 'background.paper'
              : 'background.default',
          border: 1,
          borderColor: 'divider',
          display: 'inline-flex',
        }}
      >
        <Box
          sx={{
            width: 72,
            height: 72,
            borderRadius: 2.5,
            display: 'grid',
            placeItems: 'center',
            bgcolor: theme.palette.action.hover,
          }}
        >
          {icon}
        </Box>
      </Paper>

      <Stack spacing={1}>
        <Typography variant={dense ? 'h6' : 'h5'} fontWeight={700}>
          {title}
        </Typography>
        {description && (
          <Typography variant="body1" color="text.secondary">
            {description}
          </Typography>
        )}
      </Stack>

      {(primaryAction || secondaryAction) && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          {primaryAction}
          {secondaryAction}
        </Stack>
      )}

      {tips && tips.length > 0 && (
        <Stack
          direction="row"
          spacing={1}
          justifyContent="center"
          flexWrap="wrap"
        >
          {tips.map((t, i) => (
            <Chip key={i} label={t} variant="outlined" />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
