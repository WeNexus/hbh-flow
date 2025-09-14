export function formatDuration(ms: number) {
  const hours = Math.floor(ms / 3600000); // 1h = 3,600,000 ms
  ms %= 3600000;

  const minutes = Math.floor(ms / 60000); // 1min = 60,000 ms
  ms %= 60000;

  const seconds = Math.floor(ms / 1000); // 1s = 1,000 ms
  ms %= 1000;

  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}min`);
  if (seconds > 0) parts.push(`${seconds}s`);
  if (ms > 0 && parts.length === 0) parts.push(`${ms}ms`);

  return parts.join(' ');
}
