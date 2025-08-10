import AppTheme from '@/components/theme/app-theme.tsx';
import { PrivateLayout } from '@/layouts/private.tsx';
import CssBaseline from '@mui/material/CssBaseline';
import { PublicLayout } from '@/layouts/public.tsx';
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
          <Route index path="/" element={<Dashboard />} />
        </Route>
      </Routes>
    </AppTheme>
  );
}
