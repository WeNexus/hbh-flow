import { NavigateNextRounded as NavigateNextIcon } from '@mui/icons-material';
import Breadcrumbs, { breadcrumbsClasses } from '@mui/material/Breadcrumbs';
import Typography from '@mui/material/Typography';
import { Link, useLocation } from 'react-router';
import { Link as MUILink } from '@mui/material';
import { styled } from '@mui/material/styles';
import { useMemo } from 'react';


const StyledBreadcrumbs = styled(Breadcrumbs)(({ theme }) => ({
  margin: theme.spacing(1, 0),
  [`& .${breadcrumbsClasses.separator}`]: {
    color: (theme.vars || theme).palette.action.disabled,
    margin: 1,
  },
  [`& .${breadcrumbsClasses.ol}`]: {
    alignItems: 'center',
  },
}));

export default function HeaderBreadcrumbs() {
  const route = useLocation();
  const parts = useMemo(() => {
    if (route.pathname === '/') {
      return [
        {
          label: 'Home',
          link: '/',
          isLast: true,
        },
      ];
    }

    return [
      {
        label: 'Home',
        link: '/',
        isLast: false,
      },
    ].concat(
      route.pathname
        .split('/')
        .filter(Boolean)
        .map((part, index, arr) => {
          const subParts = part.split('-');

          const label = subParts
            .map(
              (subPart) => subPart.charAt(0).toUpperCase() + subPart.slice(1),
            )
            .join(' ');

          const link = `/${route.pathname
            .split('/')
            .filter(Boolean)
            .slice(0, index + 1)
            .join('/')}`;

          return {
            label,
            link,
            isLast: index === arr.length - 1,
          };
        }),
    );
  }, [route.pathname]);

  return (
    <StyledBreadcrumbs
      aria-label="breadcrumb"
      separator={<NavigateNextIcon fontSize="small" />}
    >
      {parts.map((part) => {
        if (part.isLast) {
          return (
            <Typography
              variant="body1"
              sx={{ color: 'text.primary', fontWeight: 600 }}
            >
              {part.label}
            </Typography>
          );
        }

        return (
          <MUILink component={Link} to={part.link}>
            <Typography variant="body1">{part.label}</Typography>
          </MUILink>
        );
      })}
    </StyledBreadcrumbs>
  );
}
