import ColorModeIconDropdown from '@/components/theme/color-mode-icon-dropdown.tsx';
import CustomDatePicker from '@/components/custom-date-picker.tsx';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { HeaderEvents } from '@/layouts/private/header-events.ts';
import LinearProgress from '@mui/material/LinearProgress';
import InputAdornment from '@mui/material/InputAdornment';
import HeaderBreadcrumbs from './header-breadcrumbs.tsx';
import OutlinedInput from '@mui/material/OutlinedInput';
import { useSearchParams } from 'react-router';
import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';

import {
  type KeyboardEvent,
  type ChangeEvent,
  useCallback,
  useEffect,
  useState,
} from 'react';

export default function Header() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [loading, setLoading] = useState(false);

  const onQueryChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    window.dispatchEvent(
      new CustomEvent(HeaderEvents.query, { detail: e.target.value }),
    );
  }, []);

  const onEnter = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();

        setSearchParams((prev) => ({
          ...prev,
          q: e.currentTarget.value,
        }));
      }
    },
    [setSearchParams],
  );

  useEffect(() => {
    const queryHandler = (e: CustomEvent<string>) => setQuery(e.detail);
    const stateHandler = (
      e: CustomEvent<{ search: boolean; datePicker: boolean }>,
    ) => {
      setShowSearch(e.detail.search);
      setShowDatePicker(e.detail.datePicker);
    };
    const queryClearHandler = (e: CustomEvent<string>) => {
      window.dispatchEvent(
        new CustomEvent(HeaderEvents.query, { detail: e.detail }),
      );

      if (e.detail === '') {
        setSearchParams((prev) => {
          const newParams = new URLSearchParams(prev);
          newParams.delete('q');
          return newParams;
        });
      } else {
        setSearchParams((prev) => ({
          ...prev,
          q: e.detail,
        }));
      }
    };
    const loadingShowHandler = () => setLoading(true);
    const loadingHideHandler = () => setLoading(false);

    window.addEventListener(HeaderEvents.querySubmit as any, queryClearHandler);
    window.addEventListener(HeaderEvents.query as any, queryHandler);
    window.addEventListener(HeaderEvents.ui as any, stateHandler);
    window.addEventListener(
      HeaderEvents.loadingShow as any,
      loadingShowHandler,
    );
    window.addEventListener(
      HeaderEvents.loadingHide as any,
      loadingHideHandler,
    );

    return () => {
      window.removeEventListener(
        HeaderEvents.querySubmit as any,
        queryClearHandler,
      );
      window.removeEventListener(HeaderEvents.query as any, queryHandler);
      window.removeEventListener(HeaderEvents.ui as any, stateHandler);
      window.removeEventListener(
        HeaderEvents.loadingShow as any,
        loadingShowHandler,
      );
      window.removeEventListener(
        HeaderEvents.loadingHide as any,
        loadingHideHandler,
      );
    };
  }, [setSearchParams]);

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
          {showSearch && (
            <OutlinedInput
              onChange={onQueryChange}
              onKeyDown={onEnter}
              placeholder="Search..."
              sx={{ flexGrow: 1 }}
              value={query}
              size="small"
              startAdornment={
                <InputAdornment position="start" sx={{ color: 'text.primary' }}>
                  <SearchRoundedIcon fontSize="small" />
                </InputAdornment>
              }
              inputProps={{
                'aria-label': 'search',
              }}
            />
          )}
          {showDatePicker && <CustomDatePicker />}
          <ColorModeIconDropdown />
        </Stack>
      </Stack>
      {loading ? (
        <LinearProgress variant="indeterminate" sx={{ height: 2, mt: 1 }} />
      ): <Box sx={{ height: 2, mt: 1 }}></Box>}
    </Stack>
  );
}
