import type { CredentialStatus, UsageBalance } from '../types.js';

const BALANCE_URL = 'https://api.deepseek.com/user/balance';
const TIMEOUT_MS = 15_000;

export interface DeepSeekBalanceResult {
  success: boolean;
  credentialStatus: CredentialStatus;
  available?: boolean;
  error?: string;
  balances: UsageBalance[];
}

type FetchFn = typeof fetch;

export async function fetchDeepSeekBalance(
  apiKey: string,
  fetchImpl: FetchFn = fetch,
): Promise<DeepSeekBalanceResult> {
  let resp: Response;
  try {
    resp = await fetchImpl(BALANCE_URL, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    return {
      success: false,
      credentialStatus: 'error',
      error: (err as Error).message || 'Network error',
      balances: [],
    };
  }

  if (resp.status === 401 || resp.status === 403) {
    return {
      success: false,
      credentialStatus: 'expired',
      error: `Authentication failed (HTTP ${resp.status})`,
      balances: [],
    };
  }

  if (!resp.ok) {
    return {
      success: false,
      credentialStatus: 'error',
      error: `API error (HTTP ${resp.status})`,
      balances: [],
    };
  }

  let body: unknown;
  try {
    body = await resp.json();
  } catch {
    return { success: false, credentialStatus: 'error', error: 'Failed to parse response', balances: [] };
  }

  const available = readAvailability(body);
  const balances = parseDeepSeekBalances(body);
  if (available === undefined || (!balances.length && available)) {
    return {
      success: false,
      credentialStatus: 'error',
      error: 'Invalid balance response',
      balances: [],
    };
  }

  return {
    success: true,
    credentialStatus: 'valid',
    available,
    error: available ? undefined : '当前账户无可用余额',
    balances,
  };
}

export function parseDeepSeekBalances(body: unknown): UsageBalance[] {
  if (typeof body !== 'object' || body === null) return [];
  const infos = (body as { balance_infos?: unknown }).balance_infos;
  if (!Array.isArray(infos)) return [];

  return infos.flatMap((info) => {
    if (typeof info !== 'object' || info === null) return [];
    const record = info as Record<string, unknown>;
    const currency = typeof record.currency === 'string' ? record.currency.trim().toUpperCase() : '';
    const totalBalance = asNumber(record.total_balance);
    if (!currency || totalBalance === undefined) return [];

    const grantedBalance = asNumber(record.granted_balance);
    const toppedUpBalance = asNumber(record.topped_up_balance);
    return [{
      currency,
      totalBalance,
      ...(grantedBalance === undefined ? {} : { grantedBalance }),
      ...(toppedUpBalance === undefined ? {} : { toppedUpBalance }),
    }];
  });
}

function readAvailability(body: unknown): boolean | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const value = (body as { is_available?: unknown }).is_available;
  return typeof value === 'boolean' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
