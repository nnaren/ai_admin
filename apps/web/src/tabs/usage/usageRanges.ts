import type { UsageSpend } from '../../types.js';

/** Time dimensions offered on the card, in dropdown order. */
export const USAGE_RANGES = ['today', 'yesterday', 'last7d', 'last30d', 'thisMonth', 'lastMonth'] as const;

export type UsageRange = (typeof USAGE_RANGES)[number];

export const USAGE_RANGE_LABELS: Record<UsageRange, string> = {
  today: '今天',
  yesterday: '昨天',
  last7d: '近 7 天',
  last30d: '近 30 天',
  thisMonth: '本月',
  lastMonth: '上月',
};

/** Keep in step with the backend sampler (`dailyBalanceSnapshot.ts`). */
export const SAMPLE_INTERVAL_MS = 5 * 60_000;
/** Fetch a little after each slot so the backend's fresh sample has landed. */
export const REFRESH_LEAD_MS = 10_000;

/**
 * Milliseconds until the next absolute wall-clock slot (…:00, …:05, …) + offset.
 * Mirrors the backend's cadence so the browser refreshes on the same grid.
 */
export function msUntilNextSlot(
  now: number,
  intervalMs = SAMPLE_INTERVAL_MS,
  offsetMs = REFRESH_LEAD_MS,
): number {
  const date = new Date(now);
  const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const passed = Math.floor((now - midnight - offsetMs) / intervalMs) + 1;
  let next = midnight + passed * intervalMs + offsetMs;
  if (next <= now) next += intervalMs;
  return Math.max(1, next - now);
}

/** Tooltip: exact opening/closing basis for the selected dimension. */
export function formatSpendTitle(spend: UsageSpend, label: string): string {
  const captured = new Date(spend.since);
  const stamp = Number.isNaN(captured.getTime())
    ? '未知时间'
    : captured.toLocaleString('zh-CN', { hour12: false });
  return `${label}消费 = 期初余额 ${stamp} 记录值 − 期末余额`;
}