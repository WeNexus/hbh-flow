import { useEffect, useMemo } from 'react';
import { debounce } from 'lodash-es';

export function useDebounceCallback<T extends (...args: any[]) => void>(
  callback: T,
  delay: number,
): T {
  const debounced = useMemo(
    () => debounce(callback, delay),
    [callback, delay],
  );

  useEffect(() => debounced.cancel(), [debounced]);

  return debounced as unknown as T;
}
