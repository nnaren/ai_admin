import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { UsageHistoryLog } from '../../src/services/usageHistory.js';
import { computeSpend, computeSpendByRange, rangeDayKeys } from '../../src/services/usageSpend.js';
import type { UsageBalance } from '../../src/types.js';

let tmpDir: string;
let log: UsageHistoryLog;

const cny = (totalBalance: number): UsageBalance => ({ currency: 'CNY', totalBalance });

async function recordDay(day: string, balance: number): Promise<void> {
  await log.appendDayOpening(balance, 'CNY', new Date(`${day}T00:00:01`));
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gcp-spend-'));
  log = new UsageHistoryLog('deepseek', path.join(tmpDir, 'usage-history-deepseek.log'));
  await log.ensureLoaded();
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('rangeDayKeys', () => {
  const now = new Date(2026, 9, 14, 15, 30);

  it('maps each dimension to an inclusive day window', () => {
    expect(rangeDayKeys('today', now)).toEqual({ start: '2026-10-14', end: '2026-10-14' });
    expect(rangeDayKeys('yesterday', now)).toEqual({ start: '2026-10-13', end: '2026-10-13' });
    expect(rangeDayKeys('last7d', now)).toEqual({ start: '2026-10-08', end: '2026-10-14' });
    expect(rangeDayKeys('last30d', now)).toEqual({ start: '2026-09-15', end: '2026-10-14' });
    expect(rangeDayKeys('thisMonth', now)).toEqual({ start: '2026-10-01', end: '2026-10-14' });
    expect(rangeDayKeys('lastMonth', now)).toEqual({ start: '2026-09-01', end: '2026-09-30' });
  });
});

describe('computeSpend', () => {
  const now = new Date(2026, 9, 14, 15, 30);

  it('today = the day record minus the live balance', async () => {
    await recordDay('2026-10-14', 3.27);
    expect(computeSpend(log, 'today', [cny(2.87)], now)).toEqual({
      currency: 'CNY',
      amount: 0.4,
      since: '2026-10-14T00:00:01',
    });
  });

  it('yesterday closes on today 00:00, so it ignores the live balance', async () => {
    await recordDay('2026-10-13', 5);
    await recordDay('2026-10-14', 3);
    expect(computeSpend(log, 'yesterday', [cny(1)], now)?.amount).toBe(2);
  });

  it('last7d starts at the 7th day back', async () => {
    await recordDay('2026-10-08', 10);
    await recordDay('2026-10-14', 6);
    expect(computeSpend(log, 'last7d', [cny(6)], now)?.amount).toBe(4);
  });

  it('lastMonth closes on the 1st of this month', async () => {
    await recordDay('2026-09-01', 20);
    await recordDay('2026-10-01', 9);
    expect(computeSpend(log, 'lastMonth', [cny(5)], now)?.amount).toBe(11);
  });

  it('is zero right after midnight', async () => {
    await recordDay('2026-10-14', 3.27);
    expect(computeSpend(log, 'today', [cny(3.27)], now)?.amount).toBe(0);
  });

  it('is undefined when the day has no record', async () => {
    expect(computeSpend(log, 'today', [cny(3)], now)).toBeUndefined();
  });

  it('is undefined when the closing day has no record yet', async () => {
    // Yesterday has a record but today does not, so yesterday cannot be closed.
    await recordDay('2026-10-13', 5);
    expect(computeSpend(log, 'yesterday', [cny(3)], now)).toBeUndefined();
  });

  it('is undefined with no live balances', async () => {
    await recordDay('2026-10-14', 3.27);
    expect(computeSpend(log, 'today', [], now)).toBeUndefined();
  });

  it('goes negative after a mid-period top-up', async () => {
    await recordDay('2026-10-14', 3.27);
    expect(computeSpend(log, 'today', [cny(103.27)], now)?.amount).toBe(-100);
  });

  it('prefers USD when the account holds several currencies', async () => {
    await log.appendDayOpening(20, 'USD', new Date(2026, 9, 14, 0, 0, 1));
    const spend = computeSpend(
      log,
      'today',
      [{ currency: 'CNY', totalBalance: 3 }, { currency: 'USD', totalBalance: 18 }],
      now,
    );
    expect(spend).toEqual(expect.objectContaining({ currency: 'USD', amount: 2 }));
  });
});

describe('computeSpendByRange', () => {
  const now = new Date(2026, 9, 14, 15, 30);

  it('fills every dimension, using null when a range is not on record', async () => {
    await recordDay('2026-10-01', 3);
    await recordDay('2026-10-13', 5);
    await recordDay('2026-10-14', 2.5);

    const spend = computeSpendByRange(log, [cny(2.4)], now);
    expect(spend.today).toEqual(expect.objectContaining({ amount: 0.1 }));
    expect(spend.yesterday).toEqual(expect.objectContaining({ amount: 2.5 }));
    expect(spend.thisMonth).toEqual(expect.objectContaining({ amount: 0.6 }));
    expect(spend.last7d).toBeNull();
    expect(spend.last30d).toBeNull();
    expect(spend.lastMonth).toBeNull();
  });
});
