import { fetchAccountLiveData, supportsBalanceFetch } from './accountUsage.js';
import { localDateKey, type UsageHistoryLog } from './usageHistory.js';
import type { UsageAccount, UsageBalance } from '../types.js';

/** Small offset past 00:00 so we never race the provider's own day rollover. */
export const MIDNIGHT_OFFSET_MS = 1_000;
/** When the midnight capture fails, retry before giving up until the next midnight. */
export const RETRY_MS = 60_000;

export interface CaptureResult {
  day: string;
  /** Accounts whose 00:00 record was appended to the ledger. */
  captured: string[];
  /** Accounts already recorded for today, or not balance-based at all. */
  skipped: string[];
  /** Accounts whose fetch failed — worth retrying. */
  failed: string[];
}

export interface CaptureOptions {
  now?: Date;
}

/**
 * Append today's 00:00 balance for every balance-based account.
 *
 * Idempotent: a day that already has a line is never touched again, so a boot at
 * 09:00 cannot overwrite the 00:00 record. The ledger is append-only — a failed or
 * duplicated run cannot corrupt what is already on disk.
 */
export async function captureDailyOpening(
  accounts: UsageAccount[],
  logFor: (account: UsageAccount) => Promise<UsageHistoryLog>,
  opts: CaptureOptions = {},
): Promise<CaptureResult> {
  const now = opts.now ?? new Date();
  const day = localDateKey(now);
  const result: CaptureResult = { day, captured: [], skipped: [], failed: [] };

  for (const account of accounts) {
    if (!supportsBalanceFetch(account)) {
      result.skipped.push(account.id);
      continue;
    }
    const log = await logFor(account);
    if (log.hasDay(day)) {
      result.skipped.push(account.id);
      continue;
    }
    try {
      const live = await fetchAccountLiveData(account);
      const balance = pickBalance(live.balances);
      if (!balance) {
        result.failed.push(account.id);
        continue;
      }
      if (await log.appendDayOpening(balance.totalBalance, balance.currency, now)) {
        result.captured.push(account.id);
      } else {
        result.skipped.push(account.id);
      }
    } catch {
      result.failed.push(account.id);
    }
  }
  return result;
}

function pickBalance(balances: UsageBalance[] | undefined): UsageBalance | undefined {
  if (!balances || balances.length === 0) return undefined;
  const currencies = balances.map((b) => b.currency);
  const wanted = currencies.includes('USD') ? 'USD' : currencies.includes('CNY') ? 'CNY' : currencies[0]!;
  return balances.find((b) => b.currency === wanted);
}

/** Milliseconds until the next local 00:00 (+ offset). DST-safe via local calendar math. */
export function msUntilNextMidnight(now: number, offsetMs = MIDNIGHT_OFFSET_MS): number {
  const date = new Date(now);
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, offsetMs);
  return Math.max(1, next.getTime() - now);
}

export type CaptureRunner = () => Promise<CaptureResult>;

export interface SchedulerOptions {
  now?: () => number;
  offsetMs?: number;
  retryMs?: number;
}

/**
 * Appends each day's 00:00 balance once, shortly after local midnight.
 *
 * A capture also runs on boot: a panel that was not running at 00:00 still needs
 * today's line, and the append-only ledger means a late catch-up is a new line,
 * never a rewrite of history.
 */
export class DailyCaptureScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private stopped = false;
  private nextRunAt: number | null = null;
  private readonly now: () => number;
  private readonly offsetMs: number;
  private readonly retryMs: number;

  constructor(
    private readonly run: CaptureRunner,
    opts: SchedulerOptions = {},
  ) {
    this.now = opts.now ?? Date.now;
    this.offsetMs = opts.offsetMs ?? MIDNIGHT_OFFSET_MS;
    this.retryMs = opts.retryMs ?? RETRY_MS;
  }

  get nextRunAtMs(): number | null {
    return this.nextRunAt;
  }

  async start(): Promise<void> {
    this.stopped = false;
    await this.fire();
    this.scheduleNextMidnight();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.nextRunAt = null;
  }

  private async fire(): Promise<void> {
    if (this.running || this.stopped) return;
    this.running = true;
    let result: CaptureResult | undefined;
    try {
      result = await this.run();
    } catch {
      result = undefined;
    } finally {
      this.running = false;
    }
    // Nothing captured and something failed → retry before the day is lost.
    if (result && result.captured.length === 0 && result.failed.length > 0) {
      this.schedule(this.now() + this.retryMs);
    }
  }

  private scheduleNextMidnight(): void {
    // A pending retry from `fire()` outranks the next midnight slot.
    if (this.stopped || this.timer) return;
    this.schedule(this.now() + msUntilNextMidnight(this.now(), this.offsetMs));
  }

  private schedule(at: number): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.nextRunAt = at;
    this.timer = setTimeout(
      () => {
        this.timer = null;
        void this.fire().then(() => this.scheduleNextMidnight());
      },
      Math.max(1, at - this.now()),
    );
  }
}