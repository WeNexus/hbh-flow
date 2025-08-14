import { useApi } from '@/hooks/use-api.ts';
import { useEffect, useMemo } from 'react';

export function useSocket(namespace: string) {
  const { api } = useApi();
  const socket = useMemo(
    () => api.io.socket(namespace).connect(),
    [api.io, namespace],
  );

  useEffect(() => {
    return () => {
      if (socket.connected) {
        socket.disconnect();
      }
    };
  }, [socket]);

  useEffect(() => {
    return () => {
      if (socket.connected) {
        socket.disconnect();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return socket;
}
