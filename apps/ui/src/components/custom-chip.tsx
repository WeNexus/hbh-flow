import { darken, lighten, useColorScheme, alpha } from '@mui/material/styles';
import { Chip, type SxProps, type Theme } from '@mui/material';
import { useMemo, type ReactElement } from 'react';

export interface CustomChipProps{
  icon?: ReactElement;
  label: string;
  color: string;
}

export function CustomChip(props: CustomChipProps) {
  const colorScheme = useColorScheme();

  const sx: SxProps<Theme> = useMemo(() => {
    const mode =
      colorScheme.mode === 'system' ? colorScheme.systemMode : colorScheme.mode;
    const color = mode === 'dark' ? lighten(props.color, 0.5) : props.color;

    return {
      bgcolor:
        mode === 'dark' ? darken(color, 0.8) : alpha(lighten(color, 0.8), 0.4),

      border: `1px solid ${mode === 'dark' ? darken(color, 0.8) : lighten(color, 0.8)}`,
      '& .MuiChip-icon': {
        color: mode === 'dark' ? lighten(color, 0.2) : darken(color, 0.2),
      },
      '& .MuiChip-label': {
        color,
      },
    };
  }, [colorScheme.mode, colorScheme.systemMode, props.color]);

  return <Chip label={props.label} icon={props.icon} sx={sx} />;
}
