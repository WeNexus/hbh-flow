import { MoreVertRounded as MoreVertIcon } from '@mui/icons-material';
import { styled, type Theme } from '@mui/material/styles';
import MenuButton from '@/components/menu-button.tsx';
import { useCallback } from 'react';
import * as React from 'react';

import {
  MenuItem as MuiMenuItem,
  listItemIconClasses,
  dividerClasses,
  ListItemText,
  ListItemIcon,
  type SxProps,
  paperClasses,
  IconButton,
  listClasses,
  Tooltip,
  Menu,
} from '@mui/material';

export interface OptionsMenuProps {
  title?: string;
  sx?: SxProps<Theme>;
  items: {
    label: string;
    icon?: React.ReactNode;
    onClick: (ctx: any) => void;
    disabled?: boolean;
    ctx?: any;
  }[];
}

const MenuItem = styled(MuiMenuItem)({
  margin: '2px 0',
});

export default function OptionsMenu(props: OptionsMenuProps) {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  return (
    <React.Fragment>
      {props.title ? (
        <Tooltip title={props.title}>
          <IconButton
            aria-label="Open menu"
            onClick={handleClick}
            size="small"
            sx={{
              borderColor: 'transparent',
              ...(props.sx || {}),
            }}
          >
            <MoreVertIcon />
          </IconButton>
        </Tooltip>
      ) : (
        <MenuButton
          sx={{ borderColor: 'transparent' }}
          aria-label="Open menu"
          onClick={handleClick}
        >
          <MoreVertIcon />
        </MenuButton>
      )}
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
        {props.items.map((item) => (
          <MenuItem
            disabled={item.disabled}
            onClick={handleClose}
            key={item.label}
            sx={{
              [`& .${listItemIconClasses.root}`]: {
                ml: 'auto',
                minWidth: 0,
              },
            }}
          >
            {item.icon && <ListItemIcon sx={{ mr: 1 }}>{item.icon}</ListItemIcon>}

            <ListItemText onClick={() => item.onClick(item.ctx)}>
              {item.label}&nbsp;&nbsp;
            </ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </React.Fragment>
  );
}
