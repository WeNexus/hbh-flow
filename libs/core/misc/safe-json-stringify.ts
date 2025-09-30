export function safeJsonStringify(value: unknown, space = 2): string {
  const seen = new WeakMap();
  let idCounter = 1;

  function serializer(_: string, val: unknown) {
    // Handle special values
    if (typeof val === 'function')
      return `[Function${val.name ? ': ' + val.name : ''}]`;
    if (typeof val === 'symbol') return `[Symbol: ${String(val)}]`;
    if (typeof val === 'bigint') return val.toString() + 'n';
    if (val === undefined) return '[Undefined]';

    // Only objects can be circular
    if (val && typeof val === 'object') {
      if (seen.has(val)) {
        return `[Circular#${seen.get(val)}]`;
      }
      seen.set(val, idCounter++);
    }

    return val;
  }

  return JSON.stringify(value, serializer, space);
}
