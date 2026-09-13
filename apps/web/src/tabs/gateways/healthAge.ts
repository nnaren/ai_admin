/** Format how long ago a health probe ran. Never a clock time. */
export function formatHealthAge(at: string, now = Date.now()): string {
  const then = Date.parse(at);
  if (Number.isNaN(then)) return 'unknown';
  const sec = Math.max(0, Math.floor((now - then) / 1000));
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}
