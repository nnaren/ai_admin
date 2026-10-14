import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  captureDailyOpening,
  DailyCaptureScheduler,
  msUntilNextMidnight,
} from '../../src/services/dailyBalanceCapture.js';
import { UsageHistoryLog, localDateKey } from '../../src/services/usageHistory.js';
import type { UsageAccount } from '../../src/types.js';

let tmpDir: string;
let log: UsageHistoryLog;

const deepseek: UsageAccount = { id: 'deepseek', provider: 'DeepSeek', kind: 'api', apiKey: 'sk-test' };
const minimax: UsageAccount = { id: 'minimax-cn', provider: 'MiniMax', kind: 'package', region: 'cn', apiKey: 'sk-x' };

function mockBalance(total: string): void {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({ is_available: true, balance_infos: [{ currency: 'CNY', total_balance: total }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  );
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gcp-capture-'));
  log = new UsageHistoryLog('deepseek', path.join(tmpDir, 'usage-history-deepseek.log'));
  await log.ensureLoaded();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const logFor = async () => log;

describe('msUntilNextMidnight', () => {
  it('targets 00:00 local plus the offset', () => {
    const now = new Date(2026, 9, 14, 23, 59, 0).getTime();
    expect(msUntilNextMidnight(now, 1_000)).toBe(61_000);
  });

  it('measures a full day from just after midnight', () => {
    const now = new Date(2026, 9, 14, 0, 0, 1).getTime();
    expect(msUntilNextMidnight(now, 1_000)).toBe(24 * 3600 * 1000);
  });

  it('always returns a positive delay', () => {
    expect(msUntilNextMidnight(new Date(2026, 9, 14, 0, 0, 1).getTime(), 1_000)).toBeGreaterThan(0);
  });
});

describe('captureDailyOpening', () => {
  it('appends today for API accounts and skips package accounts', async () => {
    mockBalance('3.17');
    const now = new Date(2026, 9, 14, 0, 0, 1);
    const result = await captureDailyOpening([deepseek, minimax], logFor, { now });

    expect(result.day).toBe('2026-10-14');
    expect(result.captured).toEqual(['deepseek']);
    expect(result.skipped).toEqual(['minimax-cn']);
    expect(log.openingOf('2026-10-14')?.balance).toBe(3.17);
  });

  it('never adds a second line for a day that is already recorded', async () => {
    mockBalance('3.17');
    await captureDailyOpening([deepseek], logFor, { now: new Date(2026, 9, 14, 0, 0, 1) });
    const again = await captureDailyOpening([deepseek], logFor, { now: new Date(2026, 9, 14, 16, 0) });

    expect(again.captured).toEqual([]);
    expect(again.skipped).toEqual(['deepseek']);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect((await fs.readFile(log.path, 'utf8')).trim().split('\n')).toHaveLength(2);
  });

  it('reports a fetch failure so the scheduler can retry', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 500 }));
    const result = await captureDailyOpening([deepseek], logFor);

    expect(result.captured).toEqual([]);
    expect(result.failed).toEqual(['deepseek']);
    expect(log.hasDay(localDateKey(new Date()))).toBe(false);
  });

  it('skips accounts with no API key without calling the provider', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const result = await captureDailyOpening([{ ...deepseek, apiKey: undefined }], logFor);
    expect(result.skipped).toEqual(['deepseek']);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('DailyCaptureScheduler', () => {
  it('captures on boot and arms the next midnight timer', async () => {
    mockBalance('3.17');
    const now = new Date(2026, 9, 14, 9, 0, 0).getTime();
    const scheduler = new DailyCaptureScheduler(
      () => captureDailyOpening([deepseek], logFor),
      { now: () => now },
    );

    await scheduler.start();
    expect(log.hasDay('2026-10-14')).toBe(true);
    expect(scheduler.nextRunAtMs).toBe(now + msUntilNextMidnight(now));
    scheduler.stop();
  });

  it('stops cleanly and disarms the timer', async () => {
    const scheduler = new DailyCaptureScheduler(
      () => captureDailyOpening([], logFor),
      { now: () => new Date(2026, 9, 14, 9, 0, 0).getTime() },
    );
    await scheduler.start();
    scheduler.stop();
    expect(scheduler.nextRunAtMs).toBeNull();
  });

  it('retries in retryMs when every fetch failed', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 500 }));
    const now = new Date(2026, 9, 14, 9, 0, 0).getTime();
    const scheduler = new DailyCaptureScheduler(
      () => captureDailyOpening([deepseek], logFor),
      { now: () => now, retryMs: 60_000 },
    );

    await scheduler.start();
    expect(scheduler.nextRunAtMs).toBe(now + 60_000);
    scheduler.stop();
  });

  it('waits for the next midnight when there is nothing to capture', async () => {
    const now = new Date(2026, 9, 14, 9, 0, 0).getTime();
    const scheduler = new DailyCaptureScheduler(
      () => captureDailyOpening([minimax], logFor),
      { now: () => now, retryMs: 60_000 },
    );

    await scheduler.start();
    expect(scheduler.nextRunAtMs).toBe(now + msUntilNextMidnight(now));
    scheduler.stop();
  });
});
