import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import Inventory2RoundedIcon from '@mui/icons-material/Inventory2Rounded';
import AnalyticsRoundedIcon from '@mui/icons-material/AnalyticsRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import PeopleRoundedIcon from '@mui/icons-material/PeopleRounded';
import CableRoundedIcon from '@mui/icons-material/CableRounded';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import { Link, useLocation } from 'react-router';
import ListItem from '@mui/material/ListItem';
import Stack from '@mui/material/Stack';
import List from '@mui/material/List';

const mainListItems = [
  { text: 'Home', icon: <HomeRoundedIcon />, href: '/' },
  { text: 'Workflows', icon: <AccountTreeRoundedIcon />, href: '/workflows' },
  { text: 'Integrations', icon: <CableRoundedIcon />, href: '/integrations' },
  { text: 'Analytics', icon: <AnalyticsRoundedIcon />, href: '/analytics' },
  { text: 'Products', icon: <Inventory2RoundedIcon />, href: '/products' },
];

const secondaryListItems = [
  { text: 'Users', icon: <PeopleRoundedIcon />, href: '/users' },
  { text: 'Activities', icon: <HistoryRoundedIcon />, href: '/activities' },
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
