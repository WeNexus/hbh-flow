import { useLocation, useNavigate, useParams } from 'react-router';
import { ShowWhen } from '@/components/show-when.tsx';
import { useSnackbar } from '@/hooks/use-snackbar.ts';
import { RoleIcon } from '@/components/role-icon.tsx';
import type { Role } from '@/types/backend-types.ts';
import type { UserSchema } from '@/types/schema.ts';
import { SaveBar } from '@/components/save-bar.tsx';
import { Activities } from '@/pages/activities.tsx';
import { roleColor } from '@/modules/role-color.ts';
import { useHeader } from '@/hooks/use-header.ts';
import { useApi } from '@/hooks/use-api.ts';
import { ROLES } from '@/modules/roles.ts';
import { omit } from 'lodash-es';

import {
  type AxiosResponse,
  CanceledError,
  AxiosError,
  toFormData,
} from 'axios';

import {
  InputAdornment,
  CardContent,
  FormControl,
  CardHeader,
  FormLabel,
  IconButton,
  TextField,
  Typography,
  Container,
  Skeleton,
  MenuItem,
  Tooltip,
  Divider,
  Avatar,
  Select,
  Stack,
  Grid,
  Card,
  Chip,
  Box,
} from '@mui/material';

import {
  CameraAltOutlined as CameraAltIcon,
  PersonOutlined as PersonIcon,
  CloseOutlined as CancelIcon,
  EditOutlined as EditIcon,
  MailOutlined as MailIcon,
  KeyOutlined as KeyIcon,
} from '@mui/icons-material';

import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  useFormState,
  type UseFormStateOptions,
} from '@/hooks/use-form-state.ts';

interface FormState extends Omit<UserSchema, 'id' | 'createdAt'> {
  password: string;
  confirmPassword: string;
  avatar: string | File;
}

const formStateOptions: UseFormStateOptions<FormState> = {
  validators: {
    avatar: {
      target: 'state',
      validate(value) {
        if (typeof value === 'string') {
          return;
        }

        // Maximum file size of 5MB
        // JPEG, PNG, WebP, GIF, AVIF, TIFF, SVG

        if (value && value.size > 5 * 1024 * 1024) {
          return {
            type: 'error',
            message: 'Avatar must be less than 5MB',
          };
        }

        if (
          value &&
          ![
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/gif',
            'image/avif',
            'image/tiff',
            'image/svg+xml',
          ].includes(value.type)
        ) {
          return {
            type: 'error',
            message:
              'Avatar must be a valid image file (JPEG, PNG, WebP, GIF, AVIF, TIFF, SVG)',
          };
        }
      },
    },
    name: {
      target: 'state',
      validate(value) {
        if (!value) {
          return {
            type: 'error',
            message: 'Name is required',
          };
        }

        if (value.length < 3) {
          return {
            type: 'error',
            message: 'Name must be at least 3 characters long',
          };
        }
      },
    },
    email: {
      target: 'state',
      validate(value) {
        if (!value) {
          return {
            type: 'error',
            message: 'Email is required',
          };
        }

        if (!/^[\w-]+(\.[\w-]+)*@([\w-]+\.)+[a-zA-Z]{2,7}$/.test(value)) {
          return {
            type: 'error',
            message: 'Invalid email format',
          };
        }
      },
    },
    password: {
      target: 'state',
      validate(value) {
        if (value && value.length < 8) {
          return {
            type: 'warning',
            message: `It's recommended to use a password with at least 8 characters`,
          };
        }
      },
    },
    confirmPassword: {
      target: 'state',
      validate(value, state) {
        if (value && value !== state.password) {
          return {
            type: 'error',
            message: 'Passwords do not match',
          };
        }
      },
    },
  },
};

const formStateOptionsWithCreateMode: UseFormStateOptions<FormState> = {
  ...formStateOptions,
  validators: {
    ...formStateOptions.validators,
    role: {
      target: 'state',
      validate(value) {
        if (!value) {
          return {
            type: 'error',
            message: 'Role is required',
          };
        }

        if (!ROLES.includes(value as Role)) {
          return {
            type: 'error',
            message: `Invalid role. Must be one of: ${ROLES.join(', ')}`,
          };
        }
      },
    },
    password: {
      target: 'state',
      validate(value) {
        if (!value) {
          return {
            type: 'error',
            message: 'Password is required',
          };
        }
      },
    },
    confirmPassword: {
      target: 'state',
      validate(value, state) {
        if (!value) {
          return {
            type: 'error',
            message: 'Confirm password is required',
          };
        }

        if (value !== state.password) {
          return {
            type: 'error',
            message: 'Passwords do not match',
          };
        }
      },
    },
  },
};

export function Account() {
  const showSnackbar = useSnackbar();
  const params = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user: currentUser, api } = useApi();
  const { UI: updateHeaderUI } = useHeader();

  const isCreatePage = useMemo(
    () => location.pathname.endsWith('/create'),
    [location.pathname],
  );

  const [mode, setMode] = useState<'view' | 'edit' | 'create'>(
    isCreatePage ? 'create' : 'view',
  );

  const [user, setUser] = useState(
    mode === 'create' || params.id ? null : currentUser,
  );

  const [saving, setSaving] = useState(false);

  const initialState = useMemo<FormState>(
    () =>
      user
        ? {
            name: user.name,
            email: user.email,
            role: user.role,
            avatar: `/api/users/${user.id}/avatar`,
            confirmPassword: '',
            password: '',
          }
        : ({
            name: '',
            email: '',
            role: 'OBSERVER',
            avatar: '',
            confirmPassword: '',
            password: '',
          } as FormState),
    [user],
  );

  const formState = useFormState<FormState>(
    initialState,
    isCreatePage ? formStateOptionsWithCreateMode : formStateOptions,
  );

  const {
    commitStaged,
    addToStaged,
    addChange,
    messages,
    validate,
    staged,
    state,
  } = formState;

  const isSelf = Number(user?.id) === currentUser?.id;
  const canEdit = isSelf || api.isPowerUser;
  const canEditRole =
    mode === 'create' ||
    (!isSelf &&
      canEdit &&
      user &&
      user.role !== 'SYSTEM' &&
      !(user.role === 'ADMIN' && currentUser?.role === 'DEVELOPER'));

  const avatar = useMemo(() => {
    if (!state?.avatar) {
      return null;
    }

    if (typeof state.avatar === 'string') {
      return state.avatar;
    }

    // If it's a File object, we need to create a URL
    return URL.createObjectURL(state.avatar);
  }, [state.avatar]);

  const save = useCallback(async () => {
    setSaving(true);

    const isValid = await validate(state);

    if (!isValid) {
      setSaving(false);
      return showSnackbar({
        message: 'Some fields are invalid. Please check and try again.',
        severity: 'error',
      });
    }

    try {
      const form = toFormData(
        omit(state, [
          'confirmPassword',
          typeof state.avatar === 'string' ? 'avatar' : '',
          !state.password ? 'password' : '',
          !canEditRole ? 'role' : '',
        ]),
      );

      let res: AxiosResponse<UserSchema>;

      if (isCreatePage) {
        res = await api.post<UserSchema>(`/users`, form);
      } else {
        res = await api.patch<UserSchema>(`/users/${user?.id}`, form);
      }

      if (isCreatePage) {
        navigate(`/users/${res.data.id}`, { replace: true });
      } else {
        setUser(res.data);
        api.loadUser(res.data).catch(console.error);
      }

      showSnackbar({
        message: 'Profile updated successfully',
        severity: 'success',
      });
    } catch (e) {
      if (e instanceof AxiosError) {
        showSnackbar({
          message: e.response?.data?.message || 'An error occurred',
          severity: 'error',
        });
      }
    } finally {
      setSaving(false);
    }
  }, [
    api,
    canEditRole,
    isCreatePage,
    navigate,
    showSnackbar,
    state,
    user?.id,
    validate,
  ]);

  const cancelEditing = useCallback(() => {
    setMode('view');

    if (formState.isDirty) {
      formState.reset();
    }
  }, [formState]);

  useEffect(() => {
    if (isCreatePage) {
      return;
    }

    if (!params.id) {
      setUser(currentUser);
      cancelEditing();

      return;
    }

    const abortController = new AbortController();

    // Fetch user data if an ID is provided
    api
      .get<UserSchema>(`/users/${params.id}`, {
        signal: abortController.signal,
      })
      .then((r) => {
        setUser(r.data);
      })
      .catch((e) => {
        if (e instanceof CanceledError) {
          return;
        }

        if (e instanceof AxiosError) {
          showSnackbar({
            message: e.response?.data?.message || 'An error occurred',
            severity: 'error',
          });
        } else {
          console.error(e);
        }
      });

    return () => {
      abortController.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  useEffect(() => {
    if (messages.avatar?.type === 'error') {
      showSnackbar({
        message: messages.avatar.message,
        severity: 'error',
      });
    }
  }, [messages.avatar, showSnackbar]);

  useEffect(() => {
    updateHeaderUI({
      search: false,
      datePicker: false,
      loading: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user && mode !== 'create') {
    return (
      <Container maxWidth="md" component="form">
        <Card sx={{ mb: 3, borderRadius: 4, overflow: 'hidden' }}>
          <CardContent
            justifyContent="space-between"
            alignItems="center"
            component={Stack}
            direction="row"
            spacing={2}
          >
            <Stack
              alignItems="center"
              flexWrap="wrap"
              sx={{ gap: 4 }}
              direction="row"
            >
              <Box sx={{ position: 'relative' }}>
                <Skeleton variant="circular" width={84} height={84} />
              </Box>
              <Box>
                <Stack
                  alignItems="center"
                  sx={{ mb: 0.5 }}
                  direction="row"
                  spacing={1}
                >
                  <Skeleton variant="text" width={120} height={26} />
                  <Skeleton variant="rounded" width={100} height={24} />
                </Stack>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  sx={{ color: 'text.secondary' }}
                  alignItems="flex-start"
                  spacing={1.5}
                >
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Skeleton variant="text" width={150} height={20} />
                  </Stack>
                  <Divider
                    sx={{ display: { xs: 'none', sm: 'block' } }}
                    orientation="vertical"
                    flexItem
                  />
                  <Skeleton variant="text" width={120} height={20} />
                  <Divider
                    sx={{ display: { xs: 'none', sm: 'block' } }}
                    orientation="vertical"
                    flexItem
                  />
                </Stack>
              </Box>
            </Stack>
          </CardContent>
        </Card>

        <Grid container spacing={3}>
          <Grid sx={{ borderRadius: 4, p: 3 }} component={Card} size={12}>
            <CardHeader title="Profile" subheader="Basic information" />
            <Divider
              sx={{
                marginBottom: 3,
                marginTop: 2,
              }}
            />
            <CardContent>
              <Stack spacing={3}>
                <FormControl>
                  <FormLabel htmlFor="name">Full name</FormLabel>
                  <Skeleton variant="text" width="100%" height={50} />
                </FormControl>
                <FormControl>
                  <FormLabel htmlFor="email">Email</FormLabel>
                  <Skeleton variant="text" width="100%" height={50} />
                </FormControl>
                <FormControl fullWidth disabled={!canEditRole}>
                  <FormLabel htmlFor="role">Role</FormLabel>
                  <Skeleton variant="text" width="100%" height={50} />
                </FormControl>
              </Stack>
            </CardContent>
          </Grid>
        </Grid>
      </Container>
    );
  }

  return (
    <Container maxWidth="md" component="form">
      <Card sx={{ mb: 3, borderRadius: 4, overflow: 'hidden' }}>
        <CardContent
          justifyContent="space-between"
          alignItems="center"
          component={Stack}
          direction="row"
          spacing={2}
        >
          <Stack
            alignItems="center"
            flexWrap="wrap"
            sx={{ gap: 4 }}
            direction="row"
          >
            <Box sx={{ position: 'relative' }}>
              <Avatar
                sx={{ width: 84, height: 84, boxShadow: 2 }}
                src={avatar ?? ''}
                alt={user?.name}
              />
              <ShowWhen
                when={mode === 'edit' || mode === 'create'}
                animation="zoom"
              >
                <Tooltip title="Change avatar">
                  <IconButton
                    component="label"
                    size="small"
                    sx={{
                      bgcolor: 'background.paper',
                      borderColor: 'divider',
                      position: 'absolute',
                      boxShadow: 1,
                      bottom: -8,
                      right: -8,
                    }}
                  >
                    <CameraAltIcon fontSize="small" />
                    <input
                      accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/tiff,image/svg+xml"
                      onChange={(e) => {
                        const file = e.target?.files?.[0];

                        if (file) {
                          addChange({ avatar: file }, 'avatar');
                        }
                      }}
                      type="file"
                      hidden
                    />
                  </IconButton>
                </Tooltip>
              </ShowWhen>
            </Box>
            <ShowWhen when={mode !== 'create'}>
              <Box>
                <Stack
                  alignItems="center"
                  sx={{ mb: 0.5 }}
                  direction="row"
                  spacing={1}
                >
                  <Typography variant="h5" fontWeight={700}>
                    {user?.name ?? '---'}
                  </Typography>
                  <Chip
                    icon={<RoleIcon role={user?.role ?? 'OBSERVER'} />}
                    color={roleColor(user?.role ?? 'OBSERVER')}
                    label={user?.role ?? '---'}
                    variant="outlined"
                    sx={{ px: 0.8 }}
                    size="small"
                  />
                </Stack>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  sx={{ color: 'text.secondary' }}
                  alignItems="flex-start"
                  spacing={1.5}
                >
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <MailIcon fontSize="small" />
                    <Typography variant="body2">
                      {user?.email ?? '---'}
                    </Typography>
                  </Stack>
                  <Divider
                    sx={{ display: { xs: 'none', sm: 'block' } }}
                    orientation="vertical"
                    flexItem
                  />
                  {user && (
                    <Typography variant="body2">
                      Created: {new Date(user.createdAt).toLocaleString()}
                    </Typography>
                  )}
                  <Divider
                    sx={{ display: { xs: 'none', sm: 'block' } }}
                    orientation="vertical"
                    flexItem
                  />
                </Stack>
              </Box>
            </ShowWhen>
          </Stack>

          {mode !== 'create' && (
            <Tooltip
              title={mode === 'view' ? 'Edit profile' : 'Cancel editing'}
              sx={{ alignSelf: { md: 'center', xs: 'flex-start' } }}
            >
              <IconButton
                onClick={() => {
                  setMode((mode) => (mode === 'view' ? 'edit' : 'view'));
                  formState.reset();
                }}
                color={mode === 'view' ? 'primary' : 'error'}
              >
                {mode === 'view' ? (
                  <EditIcon fontSize="small" />
                ) : (
                  <CancelIcon fontSize="small" color="error" />
                )}
              </IconButton>
            </Tooltip>
          )}
        </CardContent>
      </Card>

      <Grid container spacing={3}>
        <Grid sx={{ borderRadius: 4, p: 3 }} component={Card} size={12}>
          <CardHeader title="Profile" subheader="Basic information" />
          <Divider
            sx={{
              marginBottom: 3,
              marginTop: 2,
            }}
          />
          <CardContent>
            <Stack spacing={3}>
              <FormControl>
                <FormLabel htmlFor="name">Full name</FormLabel>
                <TextField
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <PersonIcon />
                        </InputAdornment>
                      ),
                    },
                  }}
                  onChange={(e) => addToStaged({ name: e.target.value })}
                  onBlur={() => commitStaged('name')}
                  error={messages?.name?.type === 'error'}
                  helperText={messages?.name?.message}
                  disabled={mode === 'view'}
                  value={staged.name}
                  required
                  id="name"
                  fullWidth
                />
              </FormControl>
              <FormControl>
                <FormLabel htmlFor="email">Email</FormLabel>
                <TextField
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <MailIcon />
                        </InputAdornment>
                      ),
                    },
                  }}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    addToStaged({ email: e.target.value })
                  }
                  onBlur={() => commitStaged('email')}
                  error={messages?.email?.type === 'error'}
                  helperText={messages?.email?.message}
                  disabled={mode === 'view'}
                  value={staged.email}
                  type="email"
                  id="email"
                  fullWidth
                  required
                />
              </FormControl>
              <FormControl fullWidth disabled={!canEditRole}>
                <FormLabel htmlFor="role">Role</FormLabel>
                <Select
                  onChange={(e) => {
                    addChange({ role: e.target.value as Role });
                  }}
                  disabled={!canEditRole || mode === 'view'}
                  error={messages?.role?.type === 'error'}
                  value={state.role}
                  id="role"
                >
                  {ROLES.map((r) => (
                    <MenuItem key={r} value={r} disabled={r === 'SYSTEM'}>
                      <Stack alignItems="center" direction="row" spacing={1}>
                        <RoleIcon role={r} />

                        <Typography>{r}</Typography>
                      </Stack>
                    </MenuItem>
                  ))}
                </Select>

                {messages?.role?.type === 'error' && (
                  <Typography
                    variant="caption"
                    color="error"
                    sx={{ mt: 0.5, ml: 2 }}
                  >
                    {messages.role.message}
                  </Typography>
                )}
              </FormControl>
            </Stack>
          </CardContent>
        </Grid>

        <ShowWhen
          when={mode === 'edit' || mode === 'create'}
          animation="zoom"
          component={Grid}
          props={{
            sx: { borderRadius: 4, p: 3 },
            component: Card,
            size: 12,
          }}
        >
          <CardHeader title="Security" subheader="Update password" />
          <Divider
            sx={{
              marginBottom: 3,
              marginTop: 2,
            }}
          />
          <CardContent>
            <Stack spacing={4}>
              <FormControl>
                <FormLabel htmlFor="password">Password</FormLabel>
                <TextField
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <KeyIcon />
                        </InputAdornment>
                      ),
                    },
                  }}
                  onChange={(e) => addToStaged({ password: e.target.value })}
                  onBlur={() => commitStaged('password')}
                  error={messages?.password?.type === 'error'}
                  helperText={messages?.password?.message}
                  autoComplete="new-password"
                  placeholder="••••••••••"
                  value={staged.password}
                  required={!isCreatePage}
                  type="password"
                  id="password"
                  fullWidth
                />
              </FormControl>

              <FormControl>
                <FormLabel htmlFor="confirmPassword">
                  Confirm Password
                </FormLabel>
                <TextField
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <KeyIcon />
                        </InputAdornment>
                      ),
                    },
                  }}
                  onChange={(e) =>
                    addToStaged({ confirmPassword: e.target.value })
                  }
                  onBlur={() => commitStaged('confirmPassword')}
                  error={messages?.confirmPassword?.type === 'error'}
                  helperText={messages?.confirmPassword?.message}
                  value={staged.confirmPassword}
                  autoComplete="new-password"
                  placeholder="••••••••••"
                  required={!isCreatePage}
                  id="confirmPassword"
                  type="password"
                  fullWidth
                />
              </FormControl>
            </Stack>
          </CardContent>
        </ShowWhen>
      </Grid>

      <ShowWhen
        when={mode === 'edit' || mode === 'create'}
        style={{
          position: 'sticky',
          bottom: 0,
        }}
      >
        <SaveBar onSave={save} formState={formState} saving={saving} />
      </ShowWhen>

      {mode === 'view' && (
        <Card sx={{ borderRadius: 4, mt: 3, p: 0 }}>
          <CardHeader
            subheader="Recent activities"
            sx={{ px: 3, pt: 2, mb: 3 }}
            title="Activity"
          />
          <CardContent>
            <Activities
              userId={Number(params.id ?? user?.id ?? currentUser?.id)!}
              defaultPageSize={10}
              embedded
            />
          </CardContent>
        </Card>
      )}
    </Container>
  );
}
