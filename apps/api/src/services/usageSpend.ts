import {
  lastMonthRange,
  localDateKey,
  monthStartDayKey,
  roundMoney,
  shiftDayKey,
  type UsageHistoryLog,
} from './usageHistory.js';
import type { UsageBalance, UsageSpend, UsageSpendMap } from '../types.js';

/** Selectable time dimensions on the card. Order matches the dropdown. */
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

/** Inclusive local day keys covered by a dimension. */
export function rangeDayKeys(range: UsageRange, now: Date): { start: string; end: string } {
  const today = localDateKey(now);
  switch (range) {
    case 'today':
      return { start: today, end: today };
    case 'yesterday': {
      const day = shiftDayKey(today, -1);
      return { start: day, end: day };
    }
    case 'last7d':
      return { start: shiftDayKey(today, -6), end: today };
    case 'last30d':
      return { start: shiftDayKey(today, -29), end: today };
    case 'thisMonth':
      return { start: monthStartDayKey(now), end: today };
    case 'lastMonth':
      return lastMonthRange(now);
  }
}

/**
 * Consumption per time dimension.
 *
 * The ledger holds one balance per day (that day's 00:00 record), so every
 * dimension is `opening of its first day − opening of the day after its last day`,
 * with the day after today replaced by the live balance:
 *
 *   今天  = 今天的 0 点余额 − 实时余额
 *   昨天  = 昨天的 0 点余额 − 今天的 0 点余额
 *   上月  = 上月 1 号的 0 点余额 − 本月 1 号的 0 点余额
 *
 * `null` means the ledger has no record for the range's opening day.
 */
export function computeSpendByRange(
  log: UsageHistoryLog,
  current: UsageBalance[],
  now: Date,
): UsageSpendMap {
  const result = {} as UsageSpendMap;
  for (const range of USAGE_RANGES) {
    result[range] = computeSpend(log, range, current, now) ?? null;
  }
  return result;
}

export function computeSpend(
  log: UsageHistoryLog,
  range: UsageRange,
  current: UsageBalance[],
  now: Date,
): UsageSpend | undefined {
  if (current.length === 0) return undefined;
  const currency = pickCurrency(current);
  const live = current.find((b) => b.currency === currency);
  if (!live) return undefined;

  const { start, end } = rangeDayKeys(range, now);
  const opening = log.openingOf(start);
  if (!opening) return undefined;

  const closing =
    end === localDateKey(now) ? live.totalBalance : log.closingOf(end)?.balance;
  if (typeof closing !== 'number') return undefined;

  return {
    currency,
    amount: roundMoney(opening.balance - closing),
    since: opening.stamp,
  };
}

/** Multiple currencies: USD wins, then CNY, then the first one reported. */
function pickCurrency(balances: UsageBalance[]): string {
  const currencies = balances.map((b) => b.currency);
  return currencies.includes('USD') ? 'USD' : currencies.includes('CNY') ? 'CNY' : currencies[0]!;
}