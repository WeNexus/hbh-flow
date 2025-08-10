import { PrivateLayout } from '@/layouts/private/layout.tsx';
import AppTheme from '@/components/theme/app-theme.tsx';
import { Integrations } from '@/pages/integrations.tsx';
import CssBaseline from '@mui/material/CssBaseline';
import { PublicLayout } from '@/layouts/public.tsx';
import { NotFound } from '@/pages/not-found.tsx';
import Dashboard from '@/pages/dashboard.tsx';
import { Route, Routes } from 'react-router';
import Login from '@/pages/login.tsx';

export default function App(props: { disableCustomTheme?: boolean }) {
  return (
    <AppTheme {...props}>
      <CssBaseline enableColorScheme />

      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/login" element={<Login />} />
        </Route>

        <Route element={<PrivateLayout />}>
          <Route element={<Dashboard />} path="/" index />
          <Route element={<Integrations />} path="/integrations" />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppTheme>
  );
}
