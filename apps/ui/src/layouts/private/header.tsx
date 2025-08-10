import ColorModeIconDropdown from '@/components/theme/color-mode-icon-dropdown.tsx';
import CustomDatePicker from '@/components/custom-date-picker.tsx';
import HeaderBreadcrumbs from './header-breadcrumbs.tsx';
import Search from '@/components/search.tsx';
import Stack from '@mui/material/Stack';

export interface HeaderProps {
  showSearch?: boolean;
  showDatePicker?: boolean;
}

export default function Header(props: HeaderProps) {
  const {
    showSearch = true,
    showDatePicker = true,
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
      <HeaderBreadcrumbs />
      <Stack direction="row" sx={{ gap: 1 }}>
        {showSearch && <Search />}
        {showDatePicker && <CustomDatePicker />}
        <ColorModeIconDropdown />
      </Stack>
    </Stack>
  );
}
