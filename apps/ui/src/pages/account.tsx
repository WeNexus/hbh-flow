import { useSnackbar } from '@/hooks/use-snackbar.ts';
import type { Role } from '@/types/backend-types.ts';
import type { UserSchema } from '@/types/schema.ts';
import { SaveBar } from '@/components/save-bar.tsx';
import { AxiosError, toFormData } from 'axios';
import { useApi } from '@/hooks/use-api.ts';
import { useParams } from 'react-router';
import { omit } from 'lodash-es';

import {
  InputAdornment,
  CardContent,
  CardHeader,
  FormControl,
  IconButton,
  Typography,
  FormLabel,
  Container,
  TextField,
  MenuItem,
  Tooltip,
  Divider,
  Avatar,
  Select,
  Stack,
  Card,
  Chip,
  Grid,
  Box,
} from '@mui/material';

import {
  CameraAltRounded as CameraAltIcon,
  PersonRounded as PersonIcon,
  ShieldRounded as ShieldIcon,
  MailRounded as MailIcon,
  KeyRounded as KeyIcon,
} from '@mui/icons-material';

import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  type UseFormStateOptions,
  useFormState,
} from '@/hooks/use-form-state.ts';

interface FormState extends Omit<UserSchema, 'id' | 'createdAt'> {
  password: string;
  confirmPassword: string;
  avatar: string | File;
}

const ROLES: Role[] = [
  'OBSERVER',
  'DATA_ENTRY',
  'DEVELOPER',
  'ADMIN',
  'SYSTEM',
];

const roleColor = (role: Role) => {
  switch (role) {
    case 'SYSTEM':
      return 'error';
    case 'ADMIN':
      return 'primary';
    case 'DEVELOPER':
      return 'secondary';
    case 'DATA_ENTRY':
      return 'warning';
    case 'OBSERVER':
      return 'info';
    default:
      return 'default';
  }
};

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

export function Account() {
  const { user: currentUser, api } = useApi();
  const params = useParams();
  const [user, setUser] = useState(params.id ? null : currentUser);

  const showSnackbar = useSnackbar();
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
        : ({} as FormState),
    [user],
  );

  const isSelf = !params.id;
  const canEditRole = !isSelf; // No self-demote

  const formState = useFormState<FormState>(initialState, formStateOptions);

  const {
    commitStaged,
    addToStaged,
    addChange,
    messages,
    validate,
    staged,
    state,
  } = formState;

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

  const handleSave = useCallback(async () => {
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

      const res = await api.patch<UserSchema>(`/users/${user?.id}`, form);

      setUser(res.data);
      api.loadUser(res.data).catch(console.error);

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
  }, [api, canEditRole, showSnackbar, state, user?.id, validate]);

  useEffect(() => {
    if (!params.id) {
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
      });

    return () => {
      abortController.abort();
    };
  }, [addChange, api, params.id]);

  useEffect(() => {
    if (messages.avatar?.type === 'error') {
      showSnackbar({
        message: messages.avatar.message,
        severity: 'error',
      });
    }
  }, [messages.avatar, showSnackbar]);

  if (!user) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Typography variant="h6" color="text.secondary">
          User not found.
        </Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4 }} component="form">
      <Card sx={{ mb: 3, borderRadius: 4, overflow: 'hidden' }}>
        <CardContent>
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
            </Box>
            <Box>
              <Stack
                alignItems="center"
                sx={{ mb: 0.5 }}
                direction="row"
                spacing={1}
              >
                <Typography variant="h5" fontWeight={700}>
                  {user?.name}
                </Typography>
                <Chip
                  color={roleColor(user?.role ?? 'OBSERVER')}
                  icon={<ShieldIcon />}
                  label={user?.role}
                  variant="outlined"
                  size="small"
                />
              </Stack>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                sx={{ color: 'text.secondary' }}
                alignItems="center"
                spacing={1.5}
              >
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <MailIcon fontSize="small" />
                  <Typography variant="body2">{user?.email}</Typography>
                </Stack>
                <Divider
                  sx={{ display: { xs: 'none', sm: 'block' } }}
                  orientation="vertical"
                  flexItem
                />
                <Typography variant="body2">
                  Created: {new Date(user.createdAt).toLocaleString()}
                </Typography>
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
        <Grid
          sx={{ borderRadius: 4, p: 3 }}
          size={{ lg: 6, xs: 12 }}
          component={Card}
        >
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
                  value={staged.email}
                  type="email"
                  id="email"
                  fullWidth
                />
              </FormControl>
              <FormControl fullWidth disabled={!canEditRole}>
                <FormLabel htmlFor="role">Role</FormLabel>
                <Select
                  startAdornment={
                    <InputAdornment position="start" sx={{ pl: 1 }}>
                      <ShieldIcon fontSize="small" />
                    </InputAdornment>
                  }
                  onChange={(e) => {
                    addChange({ role: e.target.value as Role });
                  }}
                  value={state.role}
                  id="role"
                >
                  {ROLES.map((r) => (
                    <MenuItem key={r} value={r} disabled={r === 'SYSTEM'}>
                      <Stack alignItems="center" direction="row" spacing={1}>
                        <Chip
                          variant="outlined"
                          color={roleColor(r)}
                          size="small"
                          label={r}
                        />
                      </Stack>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>
          </CardContent>
        </Grid>

        <Grid
          sx={{ borderRadius: 4, p: 3 }}
          size={{ lg: 6, xs: 12 }}
          component={Card}
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
                  autoComplete="new-password"
                  placeholder="••••••••••"
                  value={staged.password}
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
                  value={staged.confirmPassword}
                  autoComplete="new-password"
                  placeholder="••••••••••"
                  id="confirmPassword"
                  type="password"
                  fullWidth
                />
              </FormControl>
            </Stack>
          </CardContent>
        </Grid>
      </Grid>

      <SaveBar formState={formState} onSave={handleSave} saving={saving} />
    </Container>
  );
}
