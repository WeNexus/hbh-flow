import { useDebounceCallback } from '@/hooks/use-debounce-callback.ts';
import { HeaderEvents } from '@/layouts/private/header-events.ts';
import { useSearchParams } from 'react-router';
import { useCallback, useEffect, useState } from 'react';
import * as React from 'react';

type SetQueryWithEvent = (
  value: string | React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
) => any;

export function useSearch(debounceTime = 0): [string, SetQueryWithEvent] {
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');

  const _setQuery = useDebounceCallback(setQuery, debounceTime);
  const setQueryWithEvent = useCallback(
    ((value) => {
      window.dispatchEvent(
        new CustomEvent(HeaderEvents.query, {
          detail: typeof value === 'string' ? value : value.target.value,
        }),
      );
    }) as SetQueryWithEvent,
    [],
  );

  useEffect(() => {
    const queryHandler = (e: CustomEvent<string>) => _setQuery(e.detail);

    window.addEventListener(HeaderEvents.query as any, queryHandler);

    return () => {
      window.removeEventListener(HeaderEvents.query as any, queryHandler);
    };
  }, [_setQuery, debounceTime]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(HeaderEvents.ui, {
        detail: { search: true, datePicker: false },
      }),
    );
  }, []);

  return [query, setQueryWithEvent];
}
