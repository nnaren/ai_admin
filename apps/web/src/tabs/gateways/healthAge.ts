/** Format how long ago a health probe ran. Never a clock time. */
export function formatHealthAge(at: string, now = Date.now()): string {
  const then = Date.parse(at);
  if (Number.isNaN(then)) return '未知';
  const sec = Math.max(0, Math.floor((now - then) / 1000));
  if (sec < 5) return '刚刚';
  if (sec < 60) return `${sec}秒前`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分钟前`;
  const hr = Math.floor(min / 60);
  return `${hr}小时前`;
}
