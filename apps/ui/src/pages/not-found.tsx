import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import type { Theme } from '@mui/material/styles';
import {
  Link as MUILink,
  CardContent,
  Typography,
  useTheme,
  useMediaQuery,
  Button,
  Stack,
  Card,
  Chip,
  Box,
  type SxProps,
} from '@mui/material';

export function NotFound({ homeHref = '/' }: { homeHref?: string }) {
  const theme = useTheme();
  const isXs = useMediaQuery(theme.breakpoints.down('sm'));
  const isMdUp = useMediaQuery(theme.breakpoints.up('md'));
  const prefersReducedMotion = useMediaQuery(
    '(prefers-reduced-motion: reduce)',
  );

  return (
    <Box
      component="main"
      role="main"
      sx={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        p: { xs: 2, sm: 4 },
        position: 'relative',
        overflow: 'hidden',
        background:
          theme.palette.mode === 'dark'
            ? 'radial-gradient(1200px 500px at -10% -10%, rgba(99,102,241,.25), transparent 60%),\n               radial-gradient(800px 400px at 110% -20%, rgba(236,72,153,.20), transparent 55%),\n               linear-gradient(180deg, #0b0f19 0%, #0b0f19 40%, #0e1525 100%)'
            : 'radial-gradient(1200px 500px at -10% -10%, rgba(99,102,241,.22), transparent 60%),\n               radial-gradient(800px 400px at 110% -20%, rgba(236,72,153,.18), transparent 55%),\n               linear-gradient(180deg, #f8fafc 0%, #f1f5f9 45%, #e2e8f0 100%)',
        '&:before': {
          content: '""',
          position: 'absolute',
          inset: -200,
          background:
            theme.palette.mode === 'dark'
              ? 'radial-gradient(40% 60% at 70% 10%, rgba(56,189,248,.10), transparent 70%)'
              : 'radial-gradient(40% 60% at 70% 10%, rgba(56,189,248,.18), transparent 70%)',
          filter: 'blur(30px)',
          animation: prefersReducedMotion
            ? 'none'
            : 'floatBlob 12s ease-in-out infinite alternate',
        },
        '@keyframes floatBlob': {
          from: { transform: 'translateY(-10px)' },
          to: { transform: 'translateY(10px)' },
        },
      }}
    >
      <Card
        elevation={0}
        sx={{
          width: '100%',
          maxWidth: { xs: 720, md: 1040 },
          mx: 'auto',
          borderRadius: { xs: 4, sm: 5, md: 6 },
          backgroundColor:
            theme.palette.mode === 'dark'
              ? 'rgba(17, 24, 39, 0.6)'
              : 'rgba(255, 255, 255, 0.65)',
          backdropFilter: 'saturate(140%) blur(16px)',
          boxShadow:
            theme.palette.mode === 'dark'
              ? '0 20px 60px rgba(0, 0, 0, 0.45)'
              : '0 24px 60px rgba(15, 23, 42, 0.12)',
          border: `1px solid ${theme.palette.mode === 'dark' ? '#1f2a44' : '#e2e8f0'}`,
        }}
      >
        <CardContent sx={{ p: { xs: 3, sm: 5, md: 6 } }}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={{ xs: 3, sm: 4, md: 6 }}
            alignItems={{ xs: 'center', md: 'stretch' }}
            justifyContent="space-between"
          >
            <Box sx={{ width: { xs: '100%', md: 460 }, flexShrink: 0 }}>
              <Typography
                component="h1"
                sx={{
                  // Fluid, clamped display size: min 48px, preferred 8vw, max 96px
                  fontSize: 'clamp(48px, 8vw, 96px)',
                  lineHeight: 1,
                  fontWeight: 800,
                  letterSpacing: '-0.04em',
                  mb: 1.5,
                  background:
                    theme.palette.mode === 'dark'
                      ? 'linear-gradient(90deg, #93c5fd, #c4b5fd, #f0abfc)'
                      : 'linear-gradient(90deg, #1d4ed8, #7c3aed, #db2777)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  textShadow:
                    theme.palette.mode === 'dark'
                      ? '0 6px 24px rgba(56,189,248,.15)'
                      : '0 6px 24px rgba(29,78,216,.16)',
                }}
              >
                404
              </Typography>

              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                sx={{ mb: 1 }}
              >
                <Chip
                  label="Not Found"
                  size={isXs ? 'small' : 'medium'}
                  variant="outlined"
                />
                <Typography variant="overline" sx={{ opacity: 0.7 }}>
                  Error code: 404
                </Typography>
              </Stack>

              <Typography
                variant={isMdUp ? 'h4' : 'h5'}
                sx={{ fontWeight: 700, mb: 1, letterSpacing: '-0.01em' }}
              >
                Oops—page missing.
              </Typography>

              <Typography
                sx={{ color: 'text.secondary', mb: { xs: 2.5, sm: 3 } }}
              >
                The page you’re looking for either doesn’t exist, moved, or the
                URL has a typo. Try the buttons below.
              </Typography>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <Button
                  variant="contained"
                  size={isXs ? 'medium' : 'large'}
                  startIcon={<HomeRoundedIcon />}
                  component={MUILink}
                  underline="none"
                  href={homeHref}
                  fullWidth={isXs}
                >
                  Go Home
                </Button>
                <Button
                  size={isXs ? 'medium' : 'large'}
                  startIcon={<ArrowBackRoundedIcon />}
                  onClick={() => window.history.back()}
                  fullWidth={isXs}
                >
                  Go Back
                </Button>
              </Stack>
            </Box>

            {/* Illustration: scales fluidly; hidden on very narrow screens to avoid overflow */}
            <Box
              aria-hidden
              sx={{
                width: '100%',
                display: { xs: 'none', sm: 'grid' },
                placeItems: 'center',
                mt: { xs: 1, sm: 0 },
              }}
            >
              <Illustration
                sx={{ width: { xs: '90%', md: '100%' }, maxWidth: 560 }}
              />
            </Box>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}

function Illustration({ sx }: { sx: SxProps<Theme> }) {
  const theme = useTheme();
  const stroke = theme.palette.mode === 'dark' ? '#94a3b8' : '#334155';
  const accent = theme.palette.mode === 'dark' ? '#60a5fa' : '#2563eb';
  const accent2 = theme.palette.mode === 'dark' ? '#f472b6' : '#db2777';

  return (
    <Box component="svg" viewBox="0 0 600 480" sx={sx}>
      {/* Background shapes */}
      <defs>
        <linearGradient id="grad1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.25" />
          <stop offset="100%" stopColor={accent2} stopOpacity="0.25" />
        </linearGradient>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="8" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g filter="url(#glow)">
        <circle cx="160" cy="120" r="80" fill="url(#grad1)" />
        <circle cx="490" cy="90" r="70" fill="url(#grad1)" />
        <circle cx="520" cy="340" r="95" fill="url(#grad1)" />
        <circle cx="120" cy="340" r="110" fill="url(#grad1)" />
      </g>

      {/* Broken compass / location motif */}
      <g stroke={stroke} strokeWidth="2.5" fill="none">
        <path d="M300 110 l22 38 43 8 -31 31 6 44 -40 -20 -40 20 6 -44 -31 -31 43 -8z" />
        <circle cx="300" cy="210" r="74" />
        <path d="M300 136 v-22 M300 306 v22 M226 210 h-22 M396 210 h22" />
      </g>

      {/* 404 text */}
      <g>
        <text
          x="50%"
          y="420"
          textAnchor="middle"
          fontFamily="Inter, system-ui, -apple-system, Segoe UI, Roboto"
          fontSize="56"
          fontWeight={800}
          fill={accent}
        >
          Lost in the void
        </text>
      </g>
    </Box>
  );
}
