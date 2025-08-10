import ColorModeIconDropdown from '@/components/theme/color-mode-icon-dropdown.tsx';
import NotificationsRoundedIcon from '@mui/icons-material/NotificationsRounded';
import CustomDatePicker from './custom-date-picker.tsx';
import NavbarBreadcrumbs from './navbar-breadcrumbs.tsx';
import MenuButton from './menu-button.tsx';
import Stack from '@mui/material/Stack';
import Search from './search.tsx';

export interface HeaderProps {
  showSearch?: boolean;
  showDatePicker?: boolean;
  showNotifications?: boolean;
}

export default function Header(props: HeaderProps) {
  const {
    showSearch = true,
    showDatePicker = true,
    showNotifications = true,
  } = props;

  return (
    <Stack
      direction="row"
      sx={{
        display: { xs: 'none', md: 'flex' },
        width: '100%',
        alignItems: { xs: 'flex-start', md: 'center' },
        justifyContent: 'space-between',
        maxWidth: { sm: '100%', md: '1700px' },
        pt: 1.5,
      }}
      spacing={2}
    >
      <NavbarBreadcrumbs />
      <Stack direction="row" sx={{ gap: 1 }}>
        {showSearch && <Search />}
        {showDatePicker && <CustomDatePicker />}
        {showNotifications && (
          <MenuButton showBadge aria-label="Open notifications">
            <NotificationsRoundedIcon />
          </MenuButton>
        )}
        <ColorModeIconDropdown />
      </Stack>
    </Stack>
  );
}
