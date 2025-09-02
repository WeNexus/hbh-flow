import ManageAccountsRoundedIcon from '@mui/icons-material/ManageAccountsRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import MuiDrawer, { drawerClasses } from '@mui/material/Drawer';
import SidebarMenuContent from './sidebar-menu-content.tsx';
import OptionsMenu from '@/components/options-menu.tsx';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';
import FlowLogo from '@/assets/honeybee.svg';
import Divider from '@mui/material/Divider';
import { useApi } from '@/hooks/use-api.ts';
import { useNavigate } from 'react-router';
import Avatar from '@mui/material/Avatar';
import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';
import { useMemo } from 'react';

const drawerWidth = 240;

const Drawer = styled(MuiDrawer)({
  width: drawerWidth,
  flexShrink: 0,
  boxSizing: 'border-box',
  mt: 10,
  [`& .${drawerClasses.paper}`]: {
    width: drawerWidth,
    boxSizing: 'border-box',
  },
});

export default function Sidebar() {
  const navigate = useNavigate();
  const { user, api } = useApi();

  const menuItems = useMemo(
    () => [
      {
        label: 'My Account',
        icon: <ManageAccountsRoundedIcon />,
        onClick: () => navigate('/account'),
      },
      {
        label: 'Logout',
        icon: <LogoutRoundedIcon />,
        onClick: () => api.logout(),
      },
    ],
    [api, navigate],
  );

  return (
    <Drawer
      variant="permanent"
      sx={{
        display: { xs: 'none', md: 'block' },
        [`& .${drawerClasses.paper}`]: {
          backgroundColor: 'background.paper',
        },
      }}
    >
      <Box
        justifyContent="center"
        alignItems="flex-end"
        component={Stack}
        direction="row"
        gap={1}
        sx={{
          p: 1,
        }}
      >
        <Avatar
          sx={{ width: 30, height: 43, mb: 0.6 }}
          alt="Flow Logo"
          src={FlowLogo}
        />

        <Typography
          align="center"
          variant='h3'
        >
          Flow
        </Typography>
      </Box>
      <Divider />
      <Box
        sx={{
          overflow: 'auto',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <SidebarMenuContent />
      </Box>
      <Stack
        direction="row"
        sx={{
          p: 2,
          gap: 1,
          alignItems: 'center',
          borderTop: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Avatar
          src={`/api/users/${user?.id}/avatar?t=${user?.updatedAt}`}
          alt={user?.name || 'Anonymous'}
          sx={{ width: 36, height: 36 }}
          sizes="small"
        />
        <Box sx={{ mr: 'auto', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <Typography
            variant="body2"
            sx={{ fontWeight: 500, lineHeight: '16px' }}
          >
            {user?.name || 'Anonymous'}
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: 'text.secondary' }}
            textOverflow="ellipsis"
          >
            {user?.email}
          </Typography>
        </Box>
        <OptionsMenu items={menuItems} title="Options" />
      </Stack>
    </Drawer>
  );
}
