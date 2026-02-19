import { Link, useLocation } from 'react-router';

import {
  AccountTreeRounded as AccountTreeIcon,
  // Inventory2Rounded as Inventory2Icon,
  // AnalyticsRounded as AnalyticsIcon,
  HistoryRounded as HistoryIcon,
  PeopleRounded as PeopleIcon,
  CableRounded as CableIcon,
  HomeRounded as HomeIcon,
} from '@mui/icons-material';

import {
  ListItemButton,
  ListItemText,
  ListItemIcon,
  ListItem,
  Stack,
  List,
} from '@mui/material';

const mainListItems = [
  { text: 'Home', icon: <HomeIcon />, href: '/' },
  { text: 'Workflows', icon: <AccountTreeIcon />, href: '/workflows' },
  { text: 'Connections', icon: <CableIcon />, href: '/connections' },
  // { text: 'Analytics', icon: <AnalyticsIcon />, href: '/analytics' },
  // { text: 'Products', icon: <Inventory2Icon />, href: '/products' },
];

const secondaryListItems = [
  { text: 'Users', icon: <PeopleIcon />, href: '/users' },
  { text: 'Activities', icon: <HistoryIcon />, href: '/activities' },
];

export default function SidebarMenuContent() {
  const route = useLocation();

  return (
    <Stack sx={{ flexGrow: 1, p: 1, justifyContent: 'space-between' }}>
      <List dense>
        {mainListItems.map((item, index) => (
          <ListItem key={index} disablePadding sx={{ display: 'block' }}>
            <ListItemButton
              selected={route.pathname === item.href}
              component={Link}
              to={item.href}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
      <List dense>
        {secondaryListItems.map((item, index) => (
          <ListItem key={index} disablePadding sx={{ display: 'block' }}>
            <ListItemButton
              selected={route.pathname === item.href}
              component={Link}
              to={item.href}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Stack>
  );
}
