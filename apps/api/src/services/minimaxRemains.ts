import type { CredentialStatus, UsageRegion, UsageWindow } from '../types.js';

const REMAINS_URL: Record<UsageRegion, string> = {
  cn: 'https://api.minimaxi.com/v1/api/openplatform/coding_plan/remains',
  global: 'https://api.minimax.io/v1/api/openplatform/coding_plan/remains',
};

const TIMEOUT_MS = 15_000;

export interface MinimaxRemainsResult {
  success: boolean;
  credentialStatus: CredentialStatus;
  error?: string;
  windows: UsageWindow[];
}

type FetchFn = typeof fetch;

export async function fetchMinimaxRemains(
  apiKey: string,
  region: UsageRegion,
  fetchImpl: FetchFn = fetch,
): Promise<MinimaxRemainsResult> {
  const url = REMAINS_URL[region];
  let resp: Response;
  try {
    resp = await fetchImpl(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    return {
      success: false,
      credentialStatus: 'error',
      error: (err as Error).message || 'Network error',
      windows: [],
    };
  }

  if (resp.status === 401 || resp.status === 403) {
    return {
      success: false,
      credentialStatus: 'expired',
      error: `Authentication failed (HTTP ${resp.status})`,
      windows: [],
    };
  }

  if (!resp.ok) {
    return {
      success: false,
      credentialStatus: 'error',
      error: `API error (HTTP ${resp.status})`,
      windows: [],
    };
  }

  let body: unknown;
  try {
    body = await resp.json();
  } catch {
    return { success: false, credentialStatus: 'error', error: 'Failed to parse response', windows: [] };
  }

  const biz = readBaseResp(body);
  if (biz && biz.statusCode !== 0) {
    return {
      success: false,
      credentialStatus: 'error',
      error: `API error (code ${biz.statusCode}): ${biz.statusMsg}`,
      windows: [],
    };
  }

  return {
    success: true,
    credentialStatus: 'valid',
    windows: parseMinimaxWindows(body),
  };
}

export function parseMinimaxWindows(body: unknown): UsageWindow[] {
  if (typeof body !== 'object' || body === null) return [];
  const remains = (body as { model_remains?: unknown }).model_remains;
  if (!Array.isArray(remains)) return [];
  const item = remains.find((entry) => {
    return (
      typeof entry === 'object' &&
      entry !== null &&
      (entry as { model_name?: unknown }).model_name === 'general'
    );
  }) as Record<string, unknown> | undefined;
  if (!item) return [];

  const windows: UsageWindow[] = [];
  const intervalRemain = asNumber(item.current_interval_remaining_percent);
  if (intervalRemain !== undefined) {
    windows.push({
      id: 'fiveHour',
      label: '5h 限额',
      resetAt: toIso(item.end_time),
      quotaPercent: 100,
      usedPercent: clampUsed(100 - intervalRemain),
    });
  }
  if (asNumber(item.current_weekly_status) === 1) {
    const weeklyRemain = asNumber(item.current_weekly_remaining_percent);
    if (weeklyRemain !== undefined) {
      windows.push({
        id: 'week',
        label: '周限额',
        resetAt: toIso(item.weekly_end_time),
        quotaPercent: 100,
        usedPercent: clampUsed(100 - weeklyRemain),
      });
    }
  }
  return windows;
}

function readBaseResp(body: unknown): { statusCode: number; statusMsg: string } | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const base = (body as { base_resp?: unknown }).base_resp;
  if (typeof base !== 'object' || base === null) return undefined;
  const rec = base as { status_code?: unknown; status_msg?: unknown };
  const statusCode = typeof rec.status_code === 'number' ? rec.status_code : -1;
  const statusMsg = typeof rec.status_msg === 'string' ? rec.status_msg : 'Unknown error';
  return { statusCode, statusMsg };
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function clampUsed(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value * 10) / 10));
}

function toIso(value: unknown): string {
  const n = asNumber(value);
  if (n === undefined) return '';
  const ms = n > 1e12 ? n : n * 1000;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}
