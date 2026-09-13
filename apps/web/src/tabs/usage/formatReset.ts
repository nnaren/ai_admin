export function formatResetIn(resetAt: string, now = Date.now()): string {
  const ms = Date.parse(resetAt) - now;
  if (!Number.isFinite(ms) || ms <= 0) return '即将重置';
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}小时 ${minutes}分钟后重置`;
  return `${minutes}分钟后重置`;
}

export function usedBarPercent(usedPercent: number): number {
  return Math.min(100, Math.max(0, usedPercent));
}
