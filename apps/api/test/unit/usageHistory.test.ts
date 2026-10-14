import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  UsageHistoryLog,
  UsageHistoryStore,
  lastMonthRange,
  localDateKey,
  localStamp,
  monthStartDayKey,
  parseStamp,
  shiftDayKey,
} from '../../src/services/usageHistory.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gcp-history-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const logFor = (id = 'deepseek') =>
  new UsageHistoryLog(id, path.join(tmpDir, `usage-history-${id}.log`));

describe('stamp helpers', () => {
  it('writes a zone-free local stamp', () => {
    expect(localStamp(new Date(2026, 9, 14, 0, 0, 1))).toBe('2026-10-14T00:00:01');
    expect(localDateKey(new Date(2026, 9, 14, 23, 59, 59))).toBe('2026-10-14');
  });

  it('round-trips a stamp back to the same instant', () => {
    const date = new Date(2026, 9, 14, 0, 0, 1);
    expect(parseStamp(localStamp(date)).getTime()).toBe(date.getTime());
  });

  it('shifts days across month and year boundaries', () => {
    expect(shiftDayKey('2026-10-01', -1)).toBe('2026-09-30');
    expect(shiftDayKey('2026-01-01', -1)).toBe('2025-12-31');
    expect(shiftDayKey('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('locates month boundaries', () => {
    expect(monthStartDayKey(new Date(2026, 9, 14))).toBe('2026-10-01');
    expect(lastMonthRange(new Date(2026, 9, 14))).toEqual({ start: '2026-09-01', end: '2026-09-30' });
    expect(lastMonthRange(new Date(2026, 0, 14))).toEqual({ start: '2025-12-01', end: '2025-12-31' });
  });
});

describe('UsageHistoryLog', () => {
  it('starts empty and missing', async () => {
    const log = logFor();
    await log.load();
    expect(log.all()).toEqual([]);
    expect(log.openingOf('2026-10-14')).toBeUndefined();
    expect(log.hasDay('2026-10-14')).toBe(false);
  });

  it('writes the documented two-column line format', async () => {
    const log = logFor();
    await log.load();
    await log.appendDayOpening(3.17, 'CNY', new Date(2026, 9, 14, 0, 0, 1));

    const raw = await fs.readFile(log.path, 'utf8');
    expect(raw).toContain('2026-10-14T00:00:01   3.17');
    expect(log.openingOf('2026-10-14')).toEqual({
      stamp: '2026-10-14T00:00:01',
      day: '2026-10-14',
      balance: 3.17,
    });
  });

  it('appends one line per day and never rewrites an earlier day', async () => {
    const log = logFor();
    await log.load();
    await log.appendDayOpening(5.17, 'CNY', new Date(2026, 9, 13, 0, 0, 1));
    await log.appendDayOpening(3.17, 'CNY', new Date(2026, 9, 14, 0, 0, 1));

    const lines = (await fs.readFile(log.path, 'utf8')).trim().split('\n');
    expect(lines).toEqual([
      '# account=deepseek currency=CNY',
      '2026-10-13T00:00:01   5.17',
      '2026-10-14T00:00:01   3.17',
    ]);
  });

  it('refuses to write a second line for the same day', async () => {
    const log = logFor();
    await log.load();
    const first = await log.appendDayOpening(3.17, 'CNY', new Date(2026, 9, 14, 0, 0, 1));
    const again = await log.appendDayOpening(2.9, 'CNY', new Date(2026, 9, 14, 9, 0, 1));
    const late = await log.appendDayOpening(2.5, 'CNY', new Date(2026, 9, 14, 17, 0, 1));

    expect([first, again, late]).toEqual([true, false, false]);
    expect(log.openingOf('2026-10-14')?.balance).toBe(3.17);
    expect((await fs.readFile(log.path, 'utf8')).trim().split('\n')).toHaveLength(2);
  });

  it('survives a restart with the whole history intact', async () => {
    const first = logFor();
    await first.load();
    await first.appendDayOpening(5.17, 'CNY', new Date(2026, 9, 13, 0, 0, 1));
    await first.appendDayOpening(3.17, 'CNY', new Date(2026, 9, 14, 0, 0, 1));

    // Restart = brand new object reading the same file. Nothing is cleared.
    const restarted = logFor();
    await restarted.load();
    expect(restarted.all().map((p) => p.stamp)).toEqual([
      '2026-10-13T00:00:01',
      '2026-10-14T00:00:01',
    ]);
    expect(restarted.matches('deepseek', 'CNY')).toBe(true);
  });

  it('ignores malformed lines instead of failing', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'usage-history-deepseek.log'),
      ['# account=deepseek currency=CNY', 'garbage line', '', '2026-10-14T00:00:01   3.17', 'oops  x  y'].join('\n'),
      'utf8',
    );
    const log = logFor();
    await log.load();
    expect(log.all()).toEqual([
      { stamp: '2026-10-14T00:00:01', day: '2026-10-14', balance: 3.17 },
    ]);
  });

  it('rejects a ledger belonging to another account or currency', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'usage-history-deepseek.log'),
      '# account=someone-else currency=USD\n2026-10-14T00:00:01   3.17\n',
      'utf8',
    );
    const log = logFor();
    await log.load();
    expect(log.matches('deepseek', 'CNY')).toBe(false);
  });

  it('exposes the next day as the previous day closing balance', async () => {
    const log = logFor();
    await log.load();
    await log.appendDayOpening(5.17, 'CNY', new Date(2026, 9, 13, 0, 0, 1));
    await log.appendDayOpening(3.17, 'CNY', new Date(2026, 9, 14, 0, 0, 1));
    expect(log.closingOf('2026-10-13')?.balance).toBe(3.17);
    expect(log.closingOf('2026-10-14')).toBeUndefined();
  });
});

describe('UsageHistoryStore', () => {
  it('gives each account its own file', async () => {
    const store = new UsageHistoryStore(tmpDir);
    const deepseek = await store.forAccount('deepseek');
    await deepseek.appendDayOpening(3.17, 'CNY', new Date(2026, 9, 14, 0, 0, 1));

    expect(deepseek.path).toBe(path.join(tmpDir, 'usage-history-deepseek.log'));
    expect(await fs.readdir(tmpDir)).toEqual(['usage-history-deepseek.log']);
  });

  it('returns the same log instance for the same account', async () => {
    const store = new UsageHistoryStore(tmpDir);
    expect(await store.forAccount('a')).toBe(await store.forAccount('a'));
  });

  it('sanitizes an id that is unsafe for a filename', async () => {
    const store = new UsageHistoryStore(tmpDir);
    expect(path.basename((await store.forAccount('../evil')).path)).toBe('usage-history-.._evil.log');
  });

  it('loads an existing ledger even though accounts are unknown at boot', async () => {
    // Regression: a log created lazily must still read the file before appending,
    // otherwise every restart re-appends the same day.
    const first = await new UsageHistoryStore(tmpDir).forAccount('deepseek');
    await first.appendDayOpening(3.17, 'CNY', new Date(2026, 9, 14, 0, 0, 1));

    const afterRestart = await new UsageHistoryStore(tmpDir).forAccount('deepseek');
    expect(afterRestart.all()).toHaveLength(1);

    const appended = await afterRestart.appendDayOpening(2.9, 'CNY', new Date(2026, 9, 14, 17, 0));
    expect(appended).toBe(false);

    const raw = await fs.readFile(first.path, 'utf8');
    expect(raw.trim().split('\n')).toEqual([
      '# account=deepseek currency=CNY',
      '2026-10-14T00:00:01   3.17',
    ]);
  });

  it('never writes the header comment twice', async () => {
    const log = await new UsageHistoryStore(tmpDir).forAccount('deepseek');
    await log.appendDayOpening(3.17, 'CNY', new Date(2026, 9, 14, 0, 0, 1));
    await log.appendDayOpening(2.9, 'CNY', new Date(2026, 9, 15, 0, 0, 1));

    const raw = await fs.readFile(log.path, 'utf8');
    expect(raw.match(/# account=/g)).toHaveLength(1);
  });
});
