import { useColorScheme } from '@mui/material/styles';
import * as React from 'react';

import {
  LightModeRounded as LightModeIcon,
  DarkModeRounded as DarkModeIcon,
} from '@mui/icons-material';

import {
  type IconButtonOwnProps,
  IconButton,
  MenuItem,
  Menu,
  Box,
} from '@mui/material';

export default function ColorModeIconDropdown(props: IconButtonOwnProps) {
  const { mode, systemMode, setMode } = useColorScheme();
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };
  const handleMode = (targetMode: 'system' | 'light' | 'dark') => () => {
    setMode(targetMode);
    handleClose();
  };

  if (!mode) {
    return (
      <Box
        data-screenshot="toggle-mode"
        sx={(theme) => ({
          borderRadius: (theme.vars || theme).shape.borderRadius,
          borderColor: (theme.vars || theme).palette.divider,
          verticalAlign: 'bottom',
          display: 'inline-flex',
          width: '2.25rem',
          height: '2.25rem',
          border: '1px solid',
        })}
      />
    );
  }

  const resolvedMode = (mode === 'system' ? systemMode : mode) || 'light';

  const icon = {
    light: <LightModeIcon />,
    dark: <DarkModeIcon />,
  }[resolvedMode];

  return (
    <React.Fragment>
      <IconButton
        aria-controls={open ? 'color-scheme-menu' : undefined}
        aria-expanded={open ? 'true' : undefined}
        data-screenshot="toggle-mode"
        onClick={handleClick}
        aria-haspopup="true"
        disableRipple
        size="small"
        {...props}
      >
        {icon}
      </IconButton>
      <Menu
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        onClose={handleClose}
        onClick={handleClose}
        anchorEl={anchorEl}
        id="account-menu"
        open={open}
        slotProps={{
          paper: {
            variant: 'outlined',
            elevation: 0,
            sx: {
              my: '4px',
            },
          },
        }}
      >
        <MenuItem selected={mode === 'system'} onClick={handleMode('system')}>
          System
        </MenuItem>
        <MenuItem selected={mode === 'light'} onClick={handleMode('light')}>
          Light
        </MenuItem>
        <MenuItem selected={mode === 'dark'} onClick={handleMode('dark')}>
          Dark
        </MenuItem>
      </Menu>
    </React.Fragment>
  );
}
