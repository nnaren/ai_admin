import type { FastifyInstance } from 'fastify';
import { fetchAccountLiveData } from '../services/accountUsage.js';
import { computeSpendByRange } from '../services/usageSpend.js';
import type { UsageHistoryStore } from '../services/usageHistory.js';
import type { UsageStore } from '../services/usageStore.js';
import type { UsageAccount, UsageProvider } from '../types.js';

export function registerUsageRoutes(
  app: FastifyInstance,
  store: UsageStore,
  history?: UsageHistoryStore,
  now: () => Date = () => new Date(),
): void {
  app.get('/api/usage', async () => {
    const accounts = store.list();
    return Promise.all(accounts.map((account) => toPublic(account, history, now())));
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

async function toPublic(
  account: UsageAccount,
  history: UsageHistoryStore | undefined,
  today: Date,
): Promise<UsageProvider> {
  const base = publicAccount(account);
  const live = await fetchAccountLiveData(account);
  const next: UsageProvider = {
    ...base,
    kind: live.kind,
    credentialStatus: live.credentialStatus,
    lastError: live.lastError,
    refreshedAt: today.toISOString(),
    ...(live.balances ? { balances: live.balances } : {}),
    ...(live.windows ? { windows: live.windows } : {}),
  };

  if (!live.balances?.length || !history) return next;
  const log = await history.forAccount(account.id);
  const spend = computeSpendByRange(log, live.balances, today);
  const todaySpend = spend.today;
  return {
    ...next,
    spend,
    ...(todaySpend ? { todayCost: todaySpend.amount, currency: todaySpend.currency } : {}),
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

function isHttpUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
