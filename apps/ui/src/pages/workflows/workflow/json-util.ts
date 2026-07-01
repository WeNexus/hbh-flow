/**
 * Validates a JSON string. Returns `null` when valid (or empty and allowed),
 * otherwise a human readable error message.
 */
export function validateJson(value: string, required = false): string | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return required ? 'Required.' : null;
  }

  try {
    JSON.parse(trimmed);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'Invalid JSON.';
  }
}
