import ColorModeIconDropdown from '@/components/theme/color-mode-icon-dropdown.tsx';
import CustomDatePicker from '@/components/custom-date-picker.tsx';
import { SearchRounded as SearchIcon } from '@mui/icons-material';
import HeaderBreadcrumbs from './header-breadcrumbs.tsx';
import { useHeader } from '@/hooks/use-header.ts';

import {
  InputAdornment,
  LinearProgress,
  OutlinedInput,
  Stack,
  Box,
} from '@mui/material';

import { type KeyboardEvent, type ChangeEvent, useCallback } from 'react';

export default function Header() {
  const { state, setQuery, submitQuery, setDate } = useHeader();

  const onQueryChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value),
    [setQuery],
  );

  const onEnter = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();

        submitQuery(e.currentTarget.value);
      }
    },
    [submitQuery],
  );

  return (
    <Stack direction="column" sx={{ width: '100%' }}>
      <Stack
        direction="row"
        sx={{
          display: { xs: 'none', md: 'flex' },
          width: '100%',
          alignItems: { xs: 'flex-start', md: 'center' },
          justifyContent: 'space-between',
          maxWidth: { sm: '100%', md: '1700px' },
          pt: 1.5,
        }}
        spacing={2}
      >
        <HeaderBreadcrumbs />
        <Stack direction="row" sx={{ gap: 1 }}>
          {state.search && (
            <OutlinedInput
              onChange={onQueryChange}
              onKeyDown={onEnter}
              placeholder="Search..."
              sx={{ flexGrow: 1 }}
              value={state.query}
              size="small"
              startAdornment={
                <InputAdornment position="start" sx={{ color: 'text.primary' }}>
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              }
              inputProps={{
                'aria-label': 'search',
              }}
            />
          )}
          {state.datePicker && <CustomDatePicker onChange={setDate} value={state.date} />}
          <ColorModeIconDropdown />
        </Stack>
      </Stack>
      {state.loading ? (
        <LinearProgress variant="indeterminate" sx={{ height: 2, mt: 1 }} />
      ) : (
        <Box sx={{ height: 2, mt: 1 }}></Box>
      )}
    </Stack>
  );
}
