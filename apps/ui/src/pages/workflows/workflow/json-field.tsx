import { useColorScheme } from '@mui/material/styles';
import Editor from 'react-simple-code-editor';
import { Typography, Box } from '@mui/material';
import { useCallback, useMemo } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-json';

export interface JsonFieldProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  /** Error message when the current value is not valid JSON. */
  error?: string | null;
  helperText?: string;
  minRows?: number;
  disabled?: boolean;
  placeholder?: string;
}

const MONO =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';

/**
 * A multi-line JSON editor with syntax highlighting (via Prism). Styled to look
 * like an MUI outlined field and theme-aware for light/dark modes.
 */
export function JsonField({
  label,
  value,
  onChange,
  error,
  helperText,
  minRows = 6,
  disabled,
  placeholder,
}: JsonFieldProps) {
  const { mode, systemMode } = useColorScheme();
  const dark = (mode === 'system' ? systemMode : mode) === 'dark';

  const highlight = useCallback((code: string) => {
    try {
      return Prism.highlight(code, Prism.languages.json, 'json');
    } catch {
      return code;
    }
  }, []);

  // Prism token colors, tuned per theme.
  const tokenColors = useMemo(
    () =>
      dark
        ? {
            property: '#9cdcfe',
            string: '#ce9178',
            number: '#b5cea8',
            keyword: '#569cd6',
            punctuation: '#d4d4d4',
          }
        : {
            property: '#0451a5',
            string: '#a31515',
            number: '#098658',
            keyword: '#0000ff',
            punctuation: '#3b3b3b',
          },
    [dark],
  );

  return (
    <Box>
      {label && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mb: 0.5 }}
        >
          {label}
        </Typography>
      )}

      <Box
        sx={{
          border: '1px solid',
          borderColor: error ? 'error.main' : 'divider',
          borderRadius: 1,
          bgcolor: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
          overflow: 'auto',
          maxHeight: 360,
          transition: 'border-color 0.2s',
          '&:focus-within': { borderColor: error ? 'error.main' : 'primary.main' },
          '& textarea': { outline: 'none !important' },
          '& textarea::placeholder': { color: 'text.disabled' },
          '& .token.property': { color: tokenColors.property },
          '& .token.string': { color: tokenColors.string },
          '& .token.number': { color: tokenColors.number },
          '& .token.boolean, & .token.null, & .token.keyword': {
            color: tokenColors.keyword,
          },
          '& .token.punctuation, & .token.operator': {
            color: tokenColors.punctuation,
          },
        }}
      >
        <Editor
          value={value}
          onValueChange={onChange}
          highlight={highlight}
          padding={12}
          disabled={disabled}
          placeholder={placeholder}
          style={{
            fontFamily: MONO,
            fontSize: 13,
            lineHeight: 1.5,
            minHeight: minRows * 21,
          }}
        />
      </Box>

      {(error || helperText) && (
        <Typography
          variant="caption"
          color={error ? 'error' : 'text.secondary'}
          sx={{ display: 'block', mt: 0.5 }}
        >
          {error || helperText}
        </Typography>
      )}
    </Box>
  );
}
