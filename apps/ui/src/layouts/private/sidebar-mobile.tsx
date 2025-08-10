// import NotificationsRoundedIcon from '@mui/icons-material/NotificationsRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import Drawer, { drawerClasses } from '@mui/material/Drawer';
import SidebarMenuContent from './sidebar-menu-content.tsx';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import { useApi } from '@/hooks/use-api.ts';
// import MenuButton from './menu-button.tsx';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';

interface SideMenuMobileProps {
  open: boolean | undefined;
  toggleDrawer: (newOpen: boolean) => () => void;
}

export default function SidebarMobile({ open, toggleDrawer }: SideMenuMobileProps) {
  const { user } = useApi();

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={toggleDrawer(false)}
      sx={{
        zIndex: (theme) => theme.zIndex.drawer + 1,
        [`& .${drawerClasses.paper}`]: {
          backgroundImage: 'none',
          backgroundColor: 'background.paper',
        },
      }}
    >
      <Stack
        sx={{
          maxWidth: '70dvw',
          height: '100%',
        }}
      >
        <Stack direction="row" sx={{ p: 2, pb: 0, gap: 1 }}>
          <Stack
            direction="row"
            sx={{ gap: 1, alignItems: 'center', flexGrow: 1, p: 1 }}
          >
            <Avatar
              sizes="small"
              src={`/api/users/${user?.id}/avatar`}
              alt={user?.name || 'Anonymous'}
              sx={{ width: 24, height: 24 }}
            />
            <Typography component="p" variant="h6">
              {user?.name || 'User Name'}
            </Typography>
          </Stack>
          {/*<MenuButton showBadge>
            <NotificationsRoundedIcon />
          </MenuButton>*/}
        </Stack>
        <Divider />
        <Stack sx={{ flexGrow: 1 }}>
          <SidebarMenuContent />
          <Divider />
        </Stack>
        <Stack sx={{ p: 2 }}>
          <Button variant="outlined" fullWidth startIcon={<LogoutRoundedIcon />}>
            Logout
          </Button>
        </Stack>
      </Stack>
    </Drawer>
  );
}
