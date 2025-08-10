import { colorSchemes, typography, shadows, shape } from './theme-primitives';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import type { ThemeOptions } from '@mui/material/styles';
import * as customizations from './customizations';
import * as React from 'react';

interface AppThemeProps {
  children: React.ReactNode;
  /**
   * This is for the docs site. You can ignore it or remove it.
   */
  disableCustomTheme?: boolean;
  themeComponents?: ThemeOptions['components'];
}

export default function AppTheme(props: AppThemeProps) {
  const { children, disableCustomTheme, themeComponents } = props;
  const theme = React.useMemo(() => {
    return disableCustomTheme
      ? {}
      : createTheme({
        // For more details about CSS variables configuration, see https://mui.com/material-ui/customization/css-theme-variables/configuration/
        cssVariables: {
          colorSchemeSelector: 'data-mui-color-scheme',
          cssVarPrefix: 'template',
        },
        colorSchemes, // Recently added in v6 for building light & dark mode app, see https://mui.com/material-ui/customization/palette/#color-schemes
        typography,
        shadows,
        shape,
        components: {
          ...customizations.inputsCustomizations,
          ...customizations.dataDisplayCustomizations,
          ...customizations.feedbackCustomizations,
          ...customizations.navigationCustomizations,
          ...customizations.surfacesCustomizations,
          ...customizations.chartsCustomizations,
          ...customizations.dataGridCustomizations,
          ...customizations.datePickersCustomizations,
          ...customizations.treeViewCustomizations,
          ...themeComponents,
        },
      });
  }, [disableCustomTheme, themeComponents]);
  if (disableCustomTheme) {
    return <React.Fragment>{children}</React.Fragment>;
  }
  return (
    <ThemeProvider theme={theme} disableTransitionOnChange>
      {children}
    </ThemeProvider>
  );
}