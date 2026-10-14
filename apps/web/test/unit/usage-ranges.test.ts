import { describe, it, expect } from 'vitest';
import {
  formatSpendTitle,
  msUntilNextSlot,
  USAGE_RANGES,
  USAGE_RANGE_LABELS,
} from '../../src/tabs/usage/usageRanges.js';

describe('usage ranges', () => {
  it('offers the six dimensions in dropdown order', () => {
    expect(USAGE_RANGES).toEqual(['today', 'yesterday', 'last7d', 'last30d', 'thisMonth', 'lastMonth']);
    expect(USAGE_RANGE_LABELS.today).toBe('今天');
    expect(USAGE_RANGE_LABELS.lastMonth).toBe('上月');
  });
});

describe('msUntilNextSlot', () => {
  it('targets the next 5-minute mark plus the refresh lead', () => {
    const now = new Date(2026, 9, 14, 9, 0, 0).getTime();
    expect(msUntilNextSlot(now, 300_000, 10_000)).toBe(10_000);
  });

  it('waits out the rest of the current slot', () => {
    const now = new Date(2026, 9, 14, 9, 2, 30).getTime();
    expect(msUntilNextSlot(now, 300_000, 10_000)).toBe(2 * 60_000 + 40_000);
  });

  it('always returns a positive delay', () => {
    expect(msUntilNextSlot(new Date(2026, 9, 14, 0, 0, 10).getTime(), 300_000, 10_000)).toBeGreaterThan(0);
  });
});

describe('formatSpendTitle', () => {
  it('explains the opening/closing basis', () => {
    const title = formatSpendTitle(
      { currency: 'CNY', amount: 1.5, since: new Date(2026, 9, 14, 0, 0, 1).toISOString() },
      '今天',
    );
    expect(title).toContain('今天');
    expect(title).toContain('期初余额');
    expect(title).toContain('期末余额');
  });
});