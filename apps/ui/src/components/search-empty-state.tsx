import { useHeader } from '@/hooks/use-header.ts';
import { useSearchParams } from 'react-router';
import { useEffect, useState } from 'react';
import * as React from 'react';

import {
  SentimentDissatisfiedOutlined as SentimentDissatisfiedIcon,
  SearchOutlined as SearchIconRounded,
  ClearOutlined as ClearIconRounded,
} from '@mui/icons-material';

import {
  Typography,
  useTheme,
  TextField,
  Button,
  Paper,
  Stack,
  Chip,
  Box,
} from '@mui/material';

export interface SearchEmptyStateProps {
  suggestions?: string[];
}

export function SearchEmptyState({
  suggestions = ['Check spelling', 'Try fewer keywords'],
}: SearchEmptyStateProps) {
  const theme = useTheme();
  const [searchParams] = useSearchParams();
  const originalQuery = searchParams.get('q') || '';
  const { state: headerState, submitQuery } = useHeader();
  const [query, setQuery] = useState(headerState.query);

  const onClear = React.useCallback(() => submitQuery(''), [submitQuery]);

  const onTryAgain = React.useCallback(
    () => submitQuery(headerState.query),
    [submitQuery, headerState.query],
  );

  useEffect(() => {
    setQuery(originalQuery);
  }, [originalQuery, searchParams]);

  return (
    <Stack spacing={3} sx={{ maxWidth: 760, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" spacing={1.5}>
        <Box
          sx={{
            width: 56,
            height: 56,
            borderRadius: 2,
            display: 'grid',
            placeItems: 'center',
            bgcolor: theme.palette.action.hover,
          }}
        >
          <SentimentDissatisfiedIcon />
        </Box>
        <Box>
          <Typography variant="h6" fontWeight={700}>
            No results for{' '}
            {originalQuery ? `“${originalQuery}”` : 'your search'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Couldn’t find anything that matches your search.
          </Typography>
        </Box>
      </Stack>

      <Paper
        variant="outlined"
        sx={{
          p: 2,
          borderRadius: 2.5,
          bgcolor: theme.palette.background.paper,
        }}
      >
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
          <TextField
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submitQuery(query);
              }
            }}
            placeholder="Search again"
            value={query}
            size="small"
            fullWidth
          />
          <Stack direction="row" spacing={1}>
            <Button onClick={onTryAgain} variant="contained" size="small">
              <SearchIconRounded fontSize="small" />
            </Button>
            <Button variant="outlined" onClick={onClear} size="small">
              <ClearIconRounded fontSize="small" />
            </Button>
          </Stack>
        </Stack>
      </Paper>

      <Stack spacing={1}>
        <Typography variant="subtitle2">Try the following:</Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          {suggestions.map((s, i) => (
            <Chip key={i} label={s} variant="outlined" />
          ))}
        </Stack>
      </Stack>
    </Stack>
  );
}
