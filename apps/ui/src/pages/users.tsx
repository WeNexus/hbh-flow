import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import type { UserListOutputSchema, UserSchema } from '@/types/schema.ts';
import { SearchEmptyState } from '@/components/search-empty-state.tsx';
import { useConfirmation } from '@/hooks/use-confirmation.ts';
import { useNavigate, useSearchParams } from 'react-router';
import { ErrorState } from '@/components/error-state.tsx';
import { EmptyState } from '@/components/empty-state.tsx';
import { ShowWhen } from '@/components/show-when.tsx';
import { useSnackbar } from '@/hooks/use-snackbar.ts';
import { roleColor } from '@/modules/role-color.ts';
import { useHeader } from '@/hooks/use-header.ts';
import { useApi } from '@/hooks/use-api.ts';
import type { AxiosError } from 'axios';

import OptionsMenu, {
  type OptionsMenuProps,
} from '@/components/options-menu.tsx';

import {
  type CSSProperties,
  CardContent,
  CardActions,
  Typography,
  Pagination,
  CardHeader,
  Skeleton,
  Tooltip,
  Divider,
  Avatar,
  Button,
  Stack,
  Chip,
  Grid,
  Card,
  Box,
  Fab,
} from '@mui/material';

import {
  CalendarMonthOutlined as CalendarMonthIcon,
  VerifiedUserRounded as ChipIcon,
  RefreshRounded as RefreshIcon,
  FileOpenRounded as ViewIcon,
  DeleteRounded as DeleteIcon,
  EmailOutlined as EmailIcon,
  AddRounded as CreateIcon,
} from '@mui/icons-material';

function UserCard({
  user,
  onDelete,
}: {
  user: UserSchema;
  onDelete?: (id: number) => void;
}) {
  const showSnackbar = useSnackbar();
  const confirm = useConfirmation();
  const navigate = useNavigate();
  const { user: currentUser, api } = useApi();
  const isSelf = currentUser?.id === user.id;

  const deleteUser = useCallback(
    async (id: number) => {
      const confirmed = await confirm({
        title: 'Are you sure, you want to delete this user?',
        message:
          'All data related to this user will be lost. This action is irreversible.',
      });

      if (!confirmed) {
        return;
      }

      api
        .delete(`/users/${id}`)
        .then(() => {
          if (onDelete) {
            onDelete(id);
          }

          showSnackbar({
            message: 'User deleted',
            severity: 'success',
          });
        })
        .catch((err) => {
          showSnackbar({
            message: err?.response?.data?.error || 'Failed to delete user',
            severity: 'error',
          });
        });
    },
    [api, onDelete, showSnackbar, confirm],
  );

  const menuItems = useMemo<OptionsMenuProps['items']>(
    () => [
      {
        ctx: user.id,
        label: 'View Profile',
        icon: <ViewIcon />,
        onClick(ctx) {
          navigate(`/users/${ctx}`);
        },
      },
      {
        ctx: user.id,
        label: 'Delete User',
        icon: <DeleteIcon color="error" />,
        disabled:
          isSelf ||
          !api.isPowerUser ||
          user.role === 'SYSTEM' ||
          (user.role === 'ADMIN' && currentUser?.role !== 'SYSTEM'),
        onClick: deleteUser,
      },
    ],
    [
      api.isPowerUser,
      currentUser?.role,
      deleteUser,
      isSelf,
      navigate,
      user.id,
      user.role,
    ],
  );

  return (
    <Card sx={{ height: '100%', borderRadius: 3 }}>
      <CardHeader
        avatar={
          <Avatar
            sx={{
              width: 56,
              height: 56,
              bgcolor: 'primary.light',
              color: 'primary.contrastText',
              fontWeight: 700,
              boxShadow: 1,
            }}
            src={`/api/users/${user.id}/avatar`}
            alt={user.name}
          />
        }
        title={
          <Stack
            alignItems="center"
            flexWrap="wrap"
            direction="row"
            spacing={1}
          >
            <Typography variant="subtitle1" fontWeight={700} sx={{ mr: 0.5 }}>
              {user.name || 'Unnamed'}
            </Typography>
            <Chip
              label={(user.role || 'USER').toUpperCase()}
              color={roleColor(user.role)}
              icon={<ChipIcon />}
              sx={{ height: 22 }}
              variant="outlined"
              size="small"
            />
          </Stack>
        }
        subheader={
          <Stack
            color="text.secondary"
            alignItems="center"
            direction="row"
            spacing={1}
          >
            <EmailIcon sx={{ fontSize: 16 }} />
            <Typography variant="body2">{user.email}</Typography>
          </Stack>
        }
        action={
          <OptionsMenu sx={{ ml: 'auto' }} items={menuItems} title="Options" />
        }
        sx={{ pb: 0.5 }}
      />
      <CardContent sx={{ pt: 1 }}>
        <Divider sx={{ my: 1.25 }} />
        <Stack
          color="text.secondary"
          alignItems="center"
          direction="row"
          spacing={1.2}
        >
          <CalendarMonthIcon sx={{ fontSize: 18 }} />
          <Typography variant="body2">
            Joined {new Date(user.createdAt).toLocaleString()}
          </Typography>
        </Stack>
      </CardContent>
      <CardActions sx={{ px: 2, pb: 2, pt: 0 }}>
        {/* Reserved for future quick actions */}
        <Box sx={{ flexGrow: 1 }} />
      </CardActions>
    </Card>
  );
}

const limit = 24; // Default items per page

export function Users() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { api } = useApi();

  const {
    state: { query },
    UI: updateHeaderUI,
    loading: switchProgress,
  } = useHeader();

  const [page, setPage] = useState<number>(
    Number(searchParams.get('page')) || 1,
  );

  const [users, setUsers] = useState<UserListOutputSchema | null>(null);
  const [error, setError] = useState<AxiosError | string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const abortRef = useRef<AbortController | null>(null);

  const fetchUsers = useCallback(async () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    if (error) {
      setError(null);
    }

    try {
      const { data } = await api.get<UserListOutputSchema>('/users', {
        params: {
          search: query.trim() || undefined,
          sortField: 'createdAt',
          sortOrder: 'desc',
          page,
          limit,
        },
        signal: controller.signal,
      });

      if (!controller.signal.aborted) {
        setUsers(data);
      }
    } catch (e: any) {
      if (!controller.signal.aborted) {
        setError(e);
        setUsers(null);
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [api, page, query, error]);

  const handlePageChange = useCallback((_: any, value: number) => {
    setPage(value);
  }, []);

  const onDelete = useCallback(
    (id: number) => {
      setUsers((prev) => {
        if (!prev) return prev;
        const newData = prev.data.filter((user) => user.id !== id);

        return {
          ...prev,
          data: newData,
          count: prev.count - 1,
        };
      });

      fetchUsers();
    },
    [fetchUsers],
  );

  const skeletons = useMemo(() => Array.from({ length: 8 }), []);

  const fabStyle = useMemo<CSSProperties>(
    () => ({
      position: 'fixed',
      bottom: 20,
      right: 20,
    }),
    [],
  );

  useEffect(() => {
    if (query.trim()) {
      switchProgress(true);
    }

    fetchUsers().finally(() => {
      if (query.trim()) {
        switchProgress(false);
      }
    });

    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, page]);

  useEffect(() => {
    updateHeaderUI({
      search: true,
      datePicker: false,
      loading: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isEmpty = !loading && !error && (users?.data.length ?? 0) === 0;

  return (
    <>
      <Box sx={{ width: '100%', mx: 'auto', px: { xs: 1, sm: 2 } }}>
        {/* Error */}
        {error && <ErrorState error={error} />}

        {/* Grid */}
        {loading && !users ? (
          <Grid container spacing={2}>
            {skeletons.map((_, i) => (
              <Grid key={i} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                <Card sx={{ borderRadius: 3 }}>
                  <CardHeader
                    avatar={
                      <Skeleton variant="circular" width={56} height={56} />
                    }
                    title={<Skeleton width="60%" height={28} />}
                    subheader={<Skeleton width="40%" height={20} />}
                    action={
                      <Skeleton variant="circular" width={32} height={32} />
                    }
                  />
                  <CardContent>
                    <Skeleton width="80%" height={18} />
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        ) : query.trim() && isEmpty ? (
          <SearchEmptyState />
        ) : isEmpty ? (
          <EmptyState
            description="No user found."
            primaryAction={
              <Button
                startIcon={<RefreshIcon />}
                onClick={fetchUsers}
                variant="outlined"
              >
                Refresh
              </Button>
            }
          />
        ) : (
          <>
            <Grid container spacing={2}>
              {users?.data!.map((user) => (
                <Grid key={user.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                  <UserCard
                    user={user as unknown as UserSchema}
                    onDelete={onDelete}
                  />
                </Grid>
              ))}
            </Grid>

            {/* Pagination footer */}
            {(users?.pages ?? 1) > 1 && (
              <Stack
                sx={{ mt: 2, position: 'sticky', bottom: 0 }}
                direction={{ xs: 'column', sm: 'row' }}
                justifyContent="space-between"
                alignItems="center"
                spacing={1}
              >
                <Typography variant="body2" color="text.secondary">
                  {users?.count ?? 0} total • Page {users?.page ?? page} of{' '}
                  {users?.pages ?? 1}
                </Typography>
                <Pagination
                  onChange={handlePageChange}
                  page={users?.page ?? page}
                  count={users?.pages ?? 1}
                  shape="rounded"
                  color="primary"
                  showFirstButton
                  showLastButton
                />
              </Stack>
            )}
          </>
        )}
      </Box>

      <ShowWhen style={fabStyle} when={api.isPowerUser} animation="zoom">
        <Tooltip title="Add User" placement="left">
          <Fab
            onClick={() => navigate('/users/create')}
            variant="circular"
            color="primary"
            size="large"
          >
            <CreateIcon />
          </Fab>
        </Tooltip>
      </ShowWhen>
    </>
  );
}
