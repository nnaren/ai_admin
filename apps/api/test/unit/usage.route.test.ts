import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Fastify from 'fastify';
import { registerUsageRoutes } from '../../src/routes/usage.js';
import { UsageStore } from '../../src/services/usageStore.js';
import { UsageHistoryStore } from '../../src/services/usageHistory.js';

let tmpDir: string;
let usagePath: string;
let store: UsageStore;
let history: UsageHistoryStore;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gcp-usage-'));
  usagePath = path.join(tmpDir, 'usage.yaml');
  store = new UsageStore(usagePath);
  await store.load();
  history = new UsageHistoryStore(tmpDir);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function mockBalance(total: string): void {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({ is_available: true, balance_infos: [{ currency: 'CNY', total_balance: total }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  );
}

async function recordDay(day: string, balance: number): Promise<void> {
  const log = await history.forAccount('deepseek');
  await log.appendDayOpening(balance, 'CNY', new Date(`${day}T00:00:01`));
}

async function addDeepSeekAccount(): Promise<void> {
  const app = Fastify();
  registerUsageRoutes(app, store);
  const created = await app.inject({
    method: 'POST',
    url: '/api/usage',
    payload: { id: 'deepseek', provider: 'DeepSeek', region: 'cn', kind: 'api', apiKey: 'sk-deepseek' },
  });
  expect(created.statusCode).toBe(201);
  await app.close();
}

describe('usage account routes', () => {
  it('returns an empty list when the file is missing', async () => {
    const app = Fastify();
    registerUsageRoutes(app, store);
    const resp = await app.inject({ method: 'GET', url: '/api/usage' });
    expect(resp.statusCode).toBe(200);
    expect(resp.json()).toEqual([]);
    await app.close();
  });

  it('persists an account and never returns the api key', async () => {
    const app = Fastify();
    registerUsageRoutes(app, store);
    const created = await app.inject({
      method: 'POST',
      url: '/api/usage',
      payload: {
        id: 'minimax-cn',
        provider: 'MiniMax',
        region: 'cn',
        kind: 'package',
        apiKey: 'sk-secret',
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().account.apiKey).toBeUndefined();
    expect(created.json().account.hasKey).toBe(true);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          base_resp: { status_code: 0, status_msg: 'ok' },
          model_remains: [
            {
              model_name: 'general',
              current_interval_remaining_percent: 100,
              end_time: Date.now() + 3_600_000,
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const listed = await app.inject({ method: 'GET', url: '/api/usage' });
    expect(listed.statusCode).toBe(200);
    const [card] = listed.json() as Array<{ id: string; hasKey: boolean; apiKey?: string; lastError?: string }>;
    expect(card.id).toBe('minimax-cn');
    expect(card.hasKey).toBe(true);
    expect(card.apiKey).toBeUndefined();
    expect(JSON.stringify(listed.json())).not.toContain('sk-secret');
    await app.close();
  });

  it('returns DeepSeek account balances', async () => {
    const app = Fastify();
    registerUsageRoutes(app, store);
    await app.inject({
      method: 'POST',
      url: '/api/usage',
      payload: {
        id: 'deepseek',
        provider: 'DeepSeek',
        region: 'cn',
        kind: 'api',
        apiKey: 'sk-deepseek',
      },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          is_available: true,
          balance_infos: [{ currency: 'CNY', total_balance: '18.50' }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const listed = await app.inject({ method: 'GET', url: '/api/usage' });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()[0]).toEqual(
      expect.objectContaining({
        provider: 'DeepSeek',
        credentialStatus: 'valid',
        balances: [{ currency: 'CNY', totalBalance: 18.5 }],
      }),
    );
    expect(JSON.stringify(listed.json())).not.toContain('sk-deepseek');
    await app.close();
  });

  it('reports today usage as the day record minus the current balance', async () => {
    await addDeepSeekAccount();
    await recordDay('2026-10-14', 3.27);
    mockBalance('2.87');

    const app = Fastify();
    registerUsageRoutes(app, store, history, () => new Date(2026, 9, 14, 15, 30));

    const listed = await app.inject({ method: 'GET', url: '/api/usage' });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()[0]).toEqual(
      expect.objectContaining({
        balances: [{ currency: 'CNY', totalBalance: 2.87 }],
        todayCost: 0.4,
        currency: 'CNY',
        refreshedAt: new Date(2026, 9, 14, 15, 30).toISOString(),
        spend: expect.objectContaining({
          today: { currency: 'CNY', amount: 0.4, since: '2026-10-14T00:00:01' },
          yesterday: null,
        }),
      }),
    );
    await app.close();
  });

  it('omits spend when no day record exists yet', async () => {
    await addDeepSeekAccount();
    mockBalance('2.87');

    const app = Fastify();
    registerUsageRoutes(app, store, history, () => new Date(2026, 9, 14, 15, 30));

    const card = (await app.inject({ method: 'GET', url: '/api/usage' })).json()[0];
    expect(card.spend.today).toBeNull();
    expect(card.todayCost).toBeUndefined();
    await app.close();
  });

  it('ignores a record from a previous day', async () => {
    await addDeepSeekAccount();
    await recordDay('2026-10-13', 9);
    mockBalance('2.87');

    const app = Fastify();
    registerUsageRoutes(app, store, history, () => new Date(2026, 9, 14, 1, 0));

    const card = (await app.inject({ method: 'GET', url: '/api/usage' })).json()[0];
    expect(card.todayCost).toBeUndefined();
    await app.close();
  });

  it('answers 上月 from the previous month ledger', async () => {
    await addDeepSeekAccount();
    await recordDay('2026-09-01', 20);
    await recordDay('2026-10-01', 9);
    mockBalance('2.87');

    const app = Fastify();
    registerUsageRoutes(app, store, history, () => new Date(2026, 9, 14, 15, 30));

    const card = (await app.inject({ method: 'GET', url: '/api/usage' })).json()[0];
    expect(card.spend.lastMonth).toEqual(expect.objectContaining({ amount: 11 }));
    expect(card.spend.thisMonth).toEqual(expect.objectContaining({ amount: 9 - 2.87 }));
    await app.close();
  });
});
