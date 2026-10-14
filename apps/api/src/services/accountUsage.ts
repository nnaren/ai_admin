import { fetchDeepSeekBalance } from './deepseekBalance.js';
import { fetchMinimaxRemains } from './minimaxRemains.js';
import type {
  CredentialStatus,
  UsageAccount,
  UsageBalance,
  UsageRegion,
  UsageWindow,
} from '../types.js';

/** Live, freshly-fetched data for one account. Shared by `/api/usage` and the daily snapshot. */
export interface AccountLiveData {
  kind: 'api' | 'package';
  credentialStatus?: CredentialStatus;
  lastError?: string;
  balances?: UsageBalance[];
  windows?: UsageWindow[];
}

export function isProvider(provider: string, expected: string): boolean {
  return provider.trim().toLowerCase() === expected;
}

/** True for accounts whose provider we know how to read a balance from. */
export function supportsBalanceFetch(account: UsageAccount): boolean {
  return (
    account.kind === 'api' &&
    Boolean(account.apiKey) &&
    isProvider(account.provider, 'deepseek')
  );
}

export async function fetchAccountLiveData(account: UsageAccount): Promise<AccountLiveData> {
  if (!account.apiKey) {
    return { kind: account.kind === 'package' ? 'package' : 'api', lastError: '未配置 API key' };
  }
  if (isProvider(account.provider, 'deepseek')) {
    const result = await fetchDeepSeekBalance(account.apiKey);
    return {
      kind: 'api',
      credentialStatus: result.credentialStatus,
      lastError: result.error,
      balances: result.balances,
    };
  }
  if (!isProvider(account.provider, 'minimax')) {
    return {
      kind: account.kind === 'package' ? 'package' : 'api',
      lastError: `暂不支持提供商 ${account.provider}`,
    };
  }
  const region: UsageRegion = account.region === 'global' ? 'global' : 'cn';
  const result = await fetchMinimaxRemains(account.apiKey, region);
  return {
    kind: 'package',
    credentialStatus: result.credentialStatus,
    lastError: result.error,
    windows: result.windows,
  };
}