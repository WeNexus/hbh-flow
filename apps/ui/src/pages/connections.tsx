import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import BugReportRoundedIcon from '@mui/icons-material/BugReportRounded';
import { SearchEmptyState } from '@/components/search-empty-state.tsx';
import LinkOffRoundedIcon from '@mui/icons-material/LinkOffRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { useCallback, useEffect, useMemo, useState } from 'react';
import CircleRoundedIcon from '@mui/icons-material/CircleRounded';
import PowerRoundedIcon from '@mui/icons-material/PowerRounded';
import { CardActions, CircularProgress } from '@mui/material';
import { EmptyState } from '@/components/empty-state.tsx';
import { ErrorState } from '@/components/error-state.tsx';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import CardHeader from '@mui/material/CardHeader';
import { useSocket } from '@/hooks/use-socket.ts';
import { useSearch } from '@/hooks/use-search.ts';
import Skeleton from '@mui/material/Skeleton';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import Button from '@mui/material/Button';
import Avatar from '@mui/material/Avatar';
import { useApi } from '@/hooks/use-api';
import type { AxiosError } from 'axios';
import Stack from '@mui/material/Stack';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Box from '@mui/material/Box';

import OptionsMenu, {
  type OptionsMenuProps,
} from '@/components/options-menu.tsx';

import type {
  ConnectionAuthorizationOutputSchema,
  ConnectionWithProviderSchema,
  ConnectionTestOutputSchema,
  ProviderSchema,
} from '@/types/schema.ts';

function BrandAvatar({ item }: { item: ConnectionWithProviderSchema }) {
  const letter = useMemo(
    () => item.provider.name?.slice(0, 1).toUpperCase() || '?',
    [item.provider.name],
  );
  if (item.provider.icon) {
    return (
      <img
        src={item.provider.icon}
        alt={item.provider.name}
        style={{
          width: 66,
          objectFit: 'contain',
        }}
      />
    );
  }
  return (
    <Avatar
      sx={{
        width: 48,
        height: 48,
        bgcolor: 'primary.main',
        fontWeight: 700,
      }}
    >
      {letter}
    </Avatar>
  );
}

function TypeChip({ type }: { type: ProviderSchema['type'] }) {
  const color = type === 'oauth2' ? 'success' : 'default';
  const label = type.toUpperCase();
  return (
    <Chip
      variant={type === 'oauth2' ? 'filled' : 'outlined'}
      color={color as any}
      label={label}
      size="small"
    />
  );
}

export function Connections() {
  const [query] = useSearch(300);
  const { api } = useApi();

  const [connections, setConnections] = useState<
    ConnectionWithProviderSchema[] | null
  >(null);
  const [error, setError] = useState<AxiosError | string | null>(null);
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const socket = useSocket('/connections');

  const fetchConnections = useCallback(
    (silent = true) => {
      if (!silent) {
        setConnections(null);
      }

      if (error) {
        setError(null);
      }

      const controller = new AbortController();

      api
        .get<ConnectionWithProviderSchema[]>('/connections', {
          signal: controller.signal,
        })
        .then((res) => {
          if (!controller.signal.aborted) {
            setConnections(res.data);
          }
        })
        .catch((e: AxiosError) => {
          if (!controller.signal.aborted) {
            setError(e);
          }
        });

      return () => {
        controller.abort();
      };
    },
    [api, error],
  );

  const connect = useCallback(
    async (connection: ConnectionWithProviderSchema) => {
      const response = await api.post<ConnectionAuthorizationOutputSchema>(
        `/providers/${connection.provider.id}/connections/${connection.id}/authorize`,
      );

      // Open a popup window for OAuth2 authorization
      window.open(
        response.data.authorizationUrl,
        '_blank',
        'width=600,height=700,scrollbars=yes',
      );
    },
    [api],
  );

  const testConnection = useCallback(
    async (connection: ConnectionWithProviderSchema) => {
      const id = `${connection.provider.id}-${connection.id}`;

      setTesting((prev) => ({
        ...prev,
        [id]: true,
      }));

      try {
        const { data } = await api.post<ConnectionTestOutputSchema>(
          `/providers/${connection.provider.id}/connections/${connection.id}/test`,
        );

        connection.working = data.working;
        connection.testedAt = new Date();

        setConnections(connections!.slice());
      } catch (error) {
        console.error('Error testing connection:', error);
      } finally {
        setTesting((prev) => ({
          ...prev,
          [id]: false,
        }));
      }
    },
    [api, connections],
  );

  const disconnect = useCallback(
    async (connection: ConnectionWithProviderSchema) => {
      try {
        await api.delete(
          `/providers/${connection.provider.id}/connections/${connection.id}`,
        );

        delete connection.connectedBy;
        connection.testedAt = new Date();
        connection.working = false;

        setConnections(connections!.slice());
      } catch (error) {
        console.error('Error testing connection:', error);
      }
    },
    [api, connections],
  );

  const menuItems = useMemo(() => {
    const result: Record<string, OptionsMenuProps['items']> = {};

    if (!connections) {
      return result;
    }

    for (const item of connections) {
      result[item.id] = [];

      if (item.connectedBy) {
        if (item.provider.type === 'oauth2' && !item.working) {
          result[item.id].push({
            label: 'Disconnect',
            onClick: disconnect,
            icon: <LinkOffRoundedIcon />,
            ctx: item,
          });
        }
      } else if (item.provider.type === 'oauth2') {
        result[item.id].push({
          label: 'Connect',
          onClick: connect,
          icon: <PowerRoundedIcon />,
          ctx: item,
        });
      }

      if (item.provider.type === 'token' || item.connectedBy) {
        result[item.id].push({
          label: 'Test connection',
          onClick: testConnection,
          icon: <BugReportRoundedIcon />,
          ctx: item,
        });
      }
    }

    return result;
  }, [connect, connections, disconnect, testConnection]);

  const filtered = useMemo(() => {
    if (!connections) {
      return null;
    }

    const q = query.trim().toLowerCase();

    if (!q) {
      return connections;
    }

    return connections.filter(
      (c) =>
        c.id.toLowerCase().includes(q) ||
        c.provider.type.toLowerCase().includes(q) ||
        c.provider.name.toLowerCase().includes(q) ||
        c.provider.id.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q),
    );
  }, [connections, query]);

  // eslint-disable-next-line
  useEffect(() => fetchConnections(), []);

  useEffect(() => {
    socket.on('activity', () => fetchConnections(true));

    return () => {
      if (socket) {
        socket.off('activity');
      }
    };
  }, [fetchConnections, socket]);

  return (
    <Box sx={{ width: '100%', mx: 'auto', px: { xs: 1, sm: 2 }, py: 2 }}>
      {!filtered && !error ? (
        <Grid container spacing={2}>
          {Array.from({ length: 6 }).map((_, idx) => (
            <Grid key={idx} size={{ xs: 12, sm: 6, md: 4 }}>
              <Card>
                <CardContent>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Skeleton variant="circular" width={48} height={48} />
                    <Box sx={{ flexGrow: 1 }}>
                      <Skeleton width="60%" height={24} />
                      <Skeleton width="40%" height={20} />
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      ) : filtered?.length ? (
        <Grid container spacing={2}>
          {filtered.map((connection) => {
            const testedAt = connection.testedAt
              ? ` (${new Date(connection.testedAt).toLocaleTimeString()})`
              : '';

            return (
              <Grid
                key={`${connection.provider.id}-${connection.id}`}
                size={{ xs: 12, sm: 6, md: 4 }}
              >
                <Card sx={{ height: '100%', borderRadius: 3 }}>
                  <CardHeader
                    avatar={<BrandAvatar item={connection} />}
                    title={
                      <Stack alignItems="center" direction="row" spacing={1}>
                        <Typography variant="subtitle1" fontWeight={700}>
                          {connection.provider.name}
                        </Typography>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ fontWeight: 500 }}
                        >
                          ({connection.id})
                        </Typography>
                        <Tooltip
                          title={
                            connection.provider.type === 'oauth2'
                              ? 'Connects via OAuth 2.0'
                              : 'Connects using API token'
                          }
                        >
                          <span>
                            <TypeChip type={connection.provider.type} />
                          </span>
                        </Tooltip>
                      </Stack>
                    }
                    action={
                      testing[`${connection.provider.id}-${connection.id}`] ? (
                        <CircularProgress
                          thickness={5}
                          size={20}
                          color="warning"
                        />
                      ) : !connection.connectedBy ? (
                        <Tooltip title={`Not connected${testedAt}`}>
                          <CircleRoundedIcon sx={{ color: 'lightgray' }} />
                        </Tooltip>
                      ) : connection.working ? (
                        <Tooltip title={`Working${testedAt}`}>
                          <CheckCircleRoundedIcon
                            sx={{ color: 'success.main' }}
                          />
                        </Tooltip>
                      ) : (
                        <Tooltip title={`Not working${testedAt}`}>
                          <CircleRoundedIcon sx={{ color: 'error.light' }} />
                        </Tooltip>
                      )
                    }
                  />

                  {connection.description && (
                    <>
                      <br />

                      <CardContent sx={{ pt: 0 }}>
                        <Typography variant="body2" color="text.secondary">
                          {connection.description}
                        </Typography>
                      </CardContent>
                    </>
                  )}

                  <Divider
                    sx={{
                      my: 1.2,
                    }}
                  />

                  <CardActions>
                    <Stack
                      direction="row"
                      alignItems="center"
                      spacing={1}
                      justifyContent="space-between"
                      width="100%"
                    >
                      {connection.connectedBy ? (
                        <Tooltip
                          title={`Connected by ${connection.connectedBy.name}`}
                        >
                          <Avatar
                            alt={connection.connectedBy.name || 'Anonymous'}
                            sx={{ width: 24, height: 24 }}
                            src={`/api/users/${connection.connectedBy.id}/avatar`}
                            sizes="small"
                          />
                        </Tooltip>
                      ) : (
                        <div></div>
                      )}

                      <OptionsMenu
                        title="Manage integration"
                        items={menuItems[connection.id]}
                        sx={{ ml: 'auto' }}
                      />
                    </Stack>
                  </CardActions>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      ) : error ? (
        <ErrorState error={error} />
      ) : query ? (
        <SearchEmptyState />
      ) : (
        !filtered?.length && (
          <EmptyState
            description="No integrations found."
            primaryAction={
              <Button
                variant="outlined"
                onClick={() => fetchConnections(false)}
                startIcon={<RefreshRoundedIcon />}
              >
                Refresh
              </Button>
            }
          />
        )
      )}
    </Box>
  );
}
