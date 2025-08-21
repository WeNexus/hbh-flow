import { HeaderEvents } from '@/layouts/private/header-events.ts';
import { useEffect } from 'react';

export function useProgress(loading?: boolean) {
  useEffect(() => {
    if (loading !== undefined) {
      window.dispatchEvent(
        new CustomEvent(
          loading ? HeaderEvents.loadingShow : HeaderEvents.loadingHide,
        ),
      );
    }
  }, [loading]);

  return (loading: boolean) => {
    window.dispatchEvent(
      new CustomEvent(
        loading ? HeaderEvents.loadingShow : HeaderEvents.loadingHide,
      ),
    );
  };
}
