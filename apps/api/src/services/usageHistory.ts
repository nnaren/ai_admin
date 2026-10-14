import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Daily balance ledger — append-only, never rewritten.
 *
 * One line per local day, written once, when the day starts:
 *
 *   2026-10-13T00:00:01   5.17
 *   2026-10-14T00:00:01   3.17
 *
 * The file is only ever appended to: the backend never truncates, rewrites or
 * deletes it, so closing and restarting the service — or a crash mid-write —
 * leaves the whole history intact. A first line comment records which account and
 * currency the log belongs to, so a mismatched file is ignored instead of
 * silently producing wrong numbers.
 */

const STAMP_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\s+(-?\d+(?:\.\d+)?)\s*$/;
const HEADER_RE = /^#\s*account=(\S+)\s+currency=(\S+)\s*$/;

export interface HistoryPoint {
  /** Local wall-clock stamp, `YYYY-MM-DDTHH:mm:ss`. */
  stamp: string;
  /** Local calendar day, `YYYY-MM-DD`. */
  day: string;
  balance: number;
}

/** `YYYY-MM-DDTHH:mm:ss` in local time — no zone suffix, matching the file format. */
export function localStamp(date: Date): string {
  const pad = (n: number) => `${n}`.padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

export function localDateKey(date: Date): string {
  const pad = (n: number) => `${n}`.padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `YYYY-MM-DDTHH:mm:ss` → local Date. Naive stamps are local by definition. */
export function parseStamp(stamp: string): Date {
  const [datePart = '', timePart = '00:00:00'] = stamp.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm, ss] = timePart.split(':').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, ss ?? 0);
}

export function shiftDayKey(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  // Noon keeps the shift clear of DST edges.
  const date = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

export function monthStartDayKey(date: Date): string {
  return localDateKey(new Date(date.getFullYear(), date.getMonth(), 1));
}

export function lastMonthRange(now: Date): { start: string; end: string } {
  const start = monthStartDayKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const end = localDateKey(new Date(now.getFullYear(), now.getMonth(), 0));
  return { start, end };
}

export class UsageHistoryLog {
  private points: HistoryPoint[] = [];
  private account: string | undefined;
  private currency: string | undefined;
  private loaded = false;

  constructor(
    readonly accountId: string,
    private readonly filePath: string,
  ) {}

  get path(): string {
    return this.filePath;
  }

  /**
   * Load once per instance. Every read and every append goes through this, so a
   * log created after boot still sees everything already on disk — a fresh
   * process must never re-append a day the file already records.
   */
  async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    await this.load();
  }

  async load(): Promise<void> {
    this.points = [];
    this.account = undefined;
    this.currency = undefined;
    this.loaded = true;
    let raw: string;
    try {
      raw = await fs.readFile(this.filePath, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw err;
    }
    for (const line of raw.split('\n')) {
      const header = HEADER_RE.exec(line.trim());
      if (header) {
        this.account = header[1];
        this.currency = header[2];
        continue;
      }
      const row = STAMP_RE.exec(line.trim());
      if (!row) continue;
      this.points.push({ stamp: row[1]!, day: row[1]!.slice(0, 10), balance: Number(row[2]) });
    }
    this.points.sort((a, b) => (a.stamp < b.stamp ? -1 : a.stamp > b.stamp ? 1 : 0));
  }

  /** A file written for another account or currency is not ours to read. */
  matches(accountId: string, currency: string): boolean {
    if (this.account === undefined && this.currency === undefined && this.points.length === 0) {
      return true;
    }
    return this.account === accountId && this.currency === currency;
  }

  /** Oldest first. */
  all(): HistoryPoint[] {
    return this.points;
  }

  hasDay(day: string): boolean {
    return this.points.some((p) => p.day === day);
  }

  /** The day's single record — the balance captured at its 00:00 slot. */
  openingOf(day: string): HistoryPoint | undefined {
    return this.points.find((p) => p.day === day);
  }

  /** The next day after `day` has a record once that day itself has started. */
  closingOf(day: string): HistoryPoint | undefined {
    return this.openingOf(shiftDayKey(day, 1));
  }

  /**
   * Append today's record — only if the day has none yet.
   *
   * Append-only by design: `O_APPEND` writes a single line atomically, and an
   * existing day is never rewritten, so restarts and partial days cannot corrupt
   * or duplicate history. Returns true when a line was added.
   */
  async appendDayOpening(
    balance: number,
    currency: string,
    now = new Date(),
  ): Promise<boolean> {
    await this.ensureLoaded();
    const day = localDateKey(now);
    if (this.hasDay(day)) return false;

    const lines: string[] = [];
    if (!this.account) lines.push(`# account=${this.accountId} currency=${currency}`);
    lines.push(`${localStamp(now)}   ${balance}`);
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.appendFile(this.filePath, `${lines.join('\n')}\n`, 'utf8');
    if (!this.account) {
      this.account = this.accountId;
      this.currency = currency;
    }
    this.points.push({ stamp: localStamp(now), day, balance });
    return true;
  }
}

/**
 * One append-only log per account, resolved next to `usage.yaml`.
 *
 * Accounts are only known once `usage.yaml` is read, so logs are created lazily
 * and always loaded from disk before use.
 */
export class UsageHistoryStore {
  private readonly logs = new Map<string, Promise<UsageHistoryLog>>();

  constructor(private readonly dir: string) {}

  async forAccount(accountId: string): Promise<UsageHistoryLog> {
    let pending = this.logs.get(accountId);
    if (!pending) {
      const safeId = accountId.replace(/[^A-Za-z0-9._-]/g, '_');
      const log = new UsageHistoryLog(accountId, path.join(this.dir, `usage-history-${safeId}.log`));
      pending = log.ensureLoaded().then(() => log);
      this.logs.set(accountId, pending);
    }
    return pending;
  }
}

export function roundMoney(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}