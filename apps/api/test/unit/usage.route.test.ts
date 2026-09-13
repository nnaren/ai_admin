import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Fastify from 'fastify';
import { registerUsageRoutes } from '../../src/routes/usage.js';
import { UsageStore } from '../../src/services/usageStore.js';

let tmpDir: string;
let usagePath: string;
let store: UsageStore;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gcp-usage-'));
  usagePath = path.join(tmpDir, 'usage.yaml');
  store = new UsageStore(usagePath);
  await store.load();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

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
});
