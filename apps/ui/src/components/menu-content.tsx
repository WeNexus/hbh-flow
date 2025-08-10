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
import ListItem from '@mui/material/ListItem';
import Stack from '@mui/material/Stack';
import List from '@mui/material/List';

const mainListItems = [
  { text: 'Home', icon: <HomeRoundedIcon /> },
  { text: 'Workflows', icon: <AccountTreeRoundedIcon /> },
  { text: 'Connections', icon: <CableRoundedIcon /> },
  { text: 'Analytics', icon: <AnalyticsRoundedIcon /> },
  { text: 'Products', icon: <Inventory2RoundedIcon /> },
];

const secondaryListItems = [
  { text: 'Users', icon: <PeopleRoundedIcon /> },
  { text: 'Activities', icon: <HistoryRoundedIcon /> },
];

export default function MenuContent() {
  return (
    <Stack sx={{ flexGrow: 1, p: 1, justifyContent: 'space-between' }}>
      <List dense>
        {mainListItems.map((item, index) => (
          <ListItem key={index} disablePadding sx={{ display: 'block' }}>
            <ListItemButton selected={index === 0}>
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
      <List dense>
        {secondaryListItems.map((item, index) => (
          <ListItem key={index} disablePadding sx={{ display: 'block' }}>
            <ListItemButton>
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Stack>
  );
}
