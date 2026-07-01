import { TextField } from '@mui/material';
import { useCallback } from 'react';

export interface JsonFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Error message when the current value is not valid JSON. */
  error?: string | null;
  helperText?: string;
  minRows?: number;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * A multiline text field tuned for editing raw JSON. It renders in a monospace
 * font and surfaces a parse error passed down from the parent.
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
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(e.target.value),
    [onChange],
  );

  return (
    <TextField
      label={label}
      value={value}
      onChange={handleChange}
      error={Boolean(error)}
      helperText={error || helperText}
      placeholder={placeholder}
      disabled={disabled}
      multiline
      minRows={minRows}
      fullWidth
      slotProps={{
        input: {
          sx: {
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            fontSize: 13,
          },
        },
      }}
    />
  );
}
