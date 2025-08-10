import MuiDrawer, { drawerClasses } from '@mui/material/Drawer';
import SidebarMenuContent from './sidebar-menu-content.tsx';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';
import OptionsMenu from './options-menu.tsx';
import Divider from '@mui/material/Divider';
import { useApi } from '@/hooks/use-api.ts';
import Avatar from '@mui/material/Avatar';
import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';

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
  const { user } = useApi();

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
        sx={{
          display: 'flex',
          mt: 'calc(var(--template-frame-height, 0px) + 4px)',
          p: 1.5,
        }}
        justifyContent="center"
      >
        <Typography variant="h5" component="h5" sx={{ fontWeight: 600 }}>
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
          src={`/api/users/${user?.id}/avatar`}
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
        <OptionsMenu />
      </Stack>
    </Drawer>
  );
}
