import ColorModeSelect from '@/components/theme/color-mode-select.tsx';
import { useFormState } from '@/hooks/use-form-state.ts';
import FormControl from '@mui/material/FormControl';
import Typography from '@mui/material/Typography';
import FormLabel from '@mui/material/FormLabel';
import TextField from '@mui/material/TextField';
import { styled } from '@mui/material/styles';
import { useApi } from '@/hooks/use-api.ts';
import { useNavigate } from 'react-router';
import Button from '@mui/material/Button';
import MuiCard from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import { Alert } from '@mui/material';
import Box from '@mui/material/Box';
import { AxiosError } from 'axios';

import {
  type FormEvent,
  type MouseEvent,
  useCallback,
  useMemo,
  useState,
} from 'react';

const Card = styled(MuiCard)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignSelf: 'center',
  width: '100%',
  padding: theme.spacing(4),
  gap: theme.spacing(2),
  margin: 'auto',
  [theme.breakpoints.up('sm')]: {
    maxWidth: '450px',
  },
  boxShadow:
    'hsla(220, 30%, 5%, 0.05) 0px 5px 15px 0px, hsla(220, 25%, 10%, 0.05) 0px 15px 35px -5px',
  ...theme.applyStyles('dark', {
    boxShadow:
      'hsla(220, 30%, 5%, 0.5) 0px 5px 15px 0px, hsla(220, 25%, 10%, 0.08) 0px 15px 35px -5px',
  }),
}));

const SignInContainer = styled(Stack)(({ theme }) => ({
  height: 'calc((1 - var(--template-frame-height, 0)) * 100dvh)',
  minHeight: '100%',
  padding: theme.spacing(2),
  [theme.breakpoints.up('sm')]: {
    padding: theme.spacing(4),
  },
  '&::before': {
    content: '""',
    display: 'block',
    position: 'absolute',
    zIndex: -1,
    inset: 0,
    backgroundImage:
      'radial-gradient(ellipse at 50% 50%, hsl(210, 100%, 97%), hsl(0, 0%, 100%))',
    backgroundRepeat: 'no-repeat',
    ...theme.applyStyles('dark', {
      backgroundImage:
        'radial-gradient(at 50% 50%, hsla(210, 100%, 16%, 0.5), hsl(220, 30%, 5%))',
    }),
  },
}));

export interface LoginFormProps {
  redirectTo?: string;
}

export function LoginForm(props: LoginFormProps) {
  const navigate = useNavigate();
  const { api } = useApi();

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const initialState = useMemo(
    () => ({
      email: '',
      password: '',
    }),
    [],
  );

  const { state, messages, addChange } = useFormState(
    initialState,
    {
      history: false,
      validators: {
        email: {
          target: 'state',
          validate: (value) => {
            if (!value || !/\S+@\S+\.\S+/.test(value)) {
              return {
                type: 'error',
                message: 'Please enter a valid email address.',
              };
            }
          },
        },
        password: {
          target: 'state',
          validate: (value) => {
            if (!value) {
              return {
                type: 'error',
                message: 'Password cannot be empty.',
              };
            }
          },
        },
      },
    },
  );

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement> | MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();

      if (loading) {
        return;
      }

      setLoading(true);

      try {
        await api.login(state.email, state.password);

        if (props.redirectTo) {
          navigate(props.redirectTo, { replace: true });
        }
      } catch (e) {
        if (e instanceof AxiosError) {
          setError(e.response?.data?.message || 'An error occurred');
        }
      } finally {
        setLoading(false);
      }
    },
    [api, loading, navigate, props.redirectTo, state.email, state.password],
  );

  return (
    <Box
      onSubmit={handleSubmit}
      component="form"
      noValidate
      sx={{
        flexDirection: 'column',
        display: 'flex',
        width: '100%',
        gap: 2,
      }}
    >
      <FormControl>
        <FormLabel htmlFor="email">Email</FormLabel>
        <TextField
          onChange={(e) =>
            addChange({
              email: e.target.value,
            })
          }
          color={messages.email?.type === 'error' ? 'error' : 'primary'}
          error={messages.email?.type === 'error'}
          helperText={messages.email?.message}
          placeholder="your@email.com"
          autoComplete="email"
          value={state.email}
          variant="outlined"
          type="email"
          id="email"
          autoFocus
          required
          fullWidth
        />
      </FormControl>
      <FormControl>
        <FormLabel htmlFor="password">Password</FormLabel>
        <TextField
          onChange={(e) => {
            addChange({
              password: e.target.value,
            });
          }}
          color={messages.password?.type === 'error' ? 'error' : 'primary'}
          error={messages.password?.type === 'error'}
          helperText={messages.password?.message}
          autoComplete="current-password"
          value={state.password}
          placeholder="••••••"
          variant="outlined"
          type="password"
          id="password"
          autoFocus
          fullWidth
          required
        />
      </FormControl>

      {error && <Alert severity="error">{error}</Alert>}

      <Button
        onClick={handleSubmit}
        variant="contained"
        disabled={loading}
        loading={loading}
        type="submit"
        fullWidth
      >
        Sign in
      </Button>
    </Box>
  );
}

export function Login() {
  return (
    <SignInContainer direction="column" justifyContent="space-between">
      <ColorModeSelect sx={{ position: 'fixed', top: '1rem', right: '1rem' }} />

      <Card variant="outlined">
        <Typography
          sx={{ width: '100%', fontSize: 'clamp(2rem, 10vw, 2.15rem)' }}
          align="center"
          component="h1"
          variant="h4"
        >
          Login
        </Typography>

        <LoginForm redirectTo='/' />
      </Card>
    </SignInContainer>
  );
}
