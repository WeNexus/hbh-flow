import ListItemIcon, { listItemIconClasses } from '@mui/material/ListItemIcon';
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import Divider, { dividerClasses } from '@mui/material/Divider';
import ListItemText from '@mui/material/ListItemText';
import MenuButton from '@/components/menu-button.tsx';
import { paperClasses } from '@mui/material/Paper';
import { listClasses } from '@mui/material/List';
import MuiMenuItem from '@mui/material/MenuItem';
import { styled } from '@mui/material/styles';
import { useApi } from '@/hooks/use-api.ts';
import Menu from '@mui/material/Menu';
import * as React from 'react';

const MenuItem = styled(MuiMenuItem)({
  margin: '2px 0',
});

export default function OptionsMenu() {
  const { api } = useApi();
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };
  return (
    <React.Fragment>
      <MenuButton
        aria-label="Open menu"
        onClick={handleClick}
        sx={{ borderColor: 'transparent' }}
      >
        <MoreVertRoundedIcon />
      </MenuButton>
      <Menu
        anchorEl={anchorEl}
        id="menu"
        open={open}
        onClose={handleClose}
        onClick={handleClose}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        sx={{
          [`& .${listClasses.root}`]: {
            padding: '4px',
          },
          [`& .${paperClasses.root}`]: {
            padding: 0,
          },
          [`& .${dividerClasses.root}`]: {
            margin: '4px -4px',
          },
        }}
      >
        <MenuItem onClick={handleClose}>My Account</MenuItem>
        <Divider />
        <MenuItem
          onClick={handleClose}
          sx={{
            [`& .${listItemIconClasses.root}`]: {
              ml: 'auto',
              minWidth: 0,
            },
          }}
        >
          <ListItemText onClick={() => api.logout()}>Logout</ListItemText>
          <ListItemIcon>
            <LogoutRoundedIcon fontSize="small" />
          </ListItemIcon>
        </MenuItem>
      </Menu>
    </React.Fragment>
  );
}
