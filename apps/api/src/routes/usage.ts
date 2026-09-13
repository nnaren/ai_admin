import type { FastifyInstance } from 'fastify';
import { fetchDeepSeekBalance } from '../services/deepseekBalance.js';
import { fetchMinimaxRemains } from '../services/minimaxRemains.js';
import type { UsageStore } from '../services/usageStore.js';
import type { UsageAccount, UsageProvider, UsageRegion } from '../types.js';

export function registerUsageRoutes(app: FastifyInstance, store: UsageStore): void {
  app.get('/api/usage', async () => {
    const accounts = store.list();
    return Promise.all(accounts.map((account) => toPublic(account)));
  });

  app.post<{ Body: UsageAccount }>('/api/usage', async (req, reply) => {
    const account = req.body;
    if (!isValidAccount(account)) {
      return reply.code(400).send({ error: 'invalid account' });
    }
    try {
      await store.add(account);
      return reply.code(201).send({ account: publicAccount(account) });
    } catch (err) {
      return reply.code(409).send({ error: (err as Error).message });
    }
  });

  app.put<{ Params: { id: string }; Body: Partial<UsageAccount> }>(
    '/api/usage/:id',
    async (req, reply) => {
      try {
        await store.update(req.params.id, req.body);
        const updated = store.get(req.params.id);
        return reply.send({ account: updated ? publicAccount(updated) : undefined });
      } catch (err) {
        return reply.code(404).send({ error: (err as Error).message });
      }
    },
  );

  app.delete<{ Params: { id: string } }>('/api/usage/:id', async (req, reply) => {
    try {
      await store.remove(req.params.id);
      return reply.code(204).send();
    } catch (err) {
      return reply.code(404).send({ error: (err as Error).message });
    }
  });
}

async function toPublic(account: UsageAccount): Promise<UsageProvider> {
  const base = publicAccount(account);
  if (!account.apiKey) {
    return {
      ...base,
      lastError: '未配置 API key',
    };
  }
  if (isProvider(account.provider, 'deepseek')) {
    const result = await fetchDeepSeekBalance(account.apiKey);
    return {
      ...base,
      kind: 'api',
      credentialStatus: result.credentialStatus,
      lastError: result.error,
      balances: result.balances,
    };
  }
  if (!isProvider(account.provider, 'minimax')) {
    return {
      ...base,
      lastError: `暂不支持提供商 ${account.provider}`,
    };
  }
  const region: UsageRegion = account.region === 'global' ? 'global' : 'cn';
  const result = await fetchMinimaxRemains(account.apiKey, region);
  return {
    ...base,
    credentialStatus: result.credentialStatus,
    lastError: result.error,
    windows: result.windows,
  };
}

function publicAccount(account: UsageAccount): UsageProvider {
  return {
    id: account.id,
    provider: account.provider,
    watermark: account.watermark,
    region: account.region,
    kind: account.kind,
    color: account.color,
    usageUrl: account.usageUrl,
    hasKey: Boolean(account.apiKey),
  };
}

function isValidAccount(value: unknown): value is UsageAccount {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    obj.id.length > 0 &&
    typeof obj.provider === 'string' &&
    obj.provider.trim().length > 0 &&
    (obj.kind === 'package' || obj.kind === 'api') &&
    (obj.usageUrl === undefined || isHttpUrl(obj.usageUrl))
  );
}

function isProvider(provider: string, expected: string): boolean {
  return provider.trim().toLowerCase() === expected;
}

function isHttpUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
