import { describe, it, expect, vi } from 'vitest';
import { fetchMinimaxRemains, parseMinimaxWindows } from '../../src/services/minimaxRemains.js';

const remainsBody = {
  base_resp: { status_code: 0, status_msg: 'ok' },
  model_remains: [
    {
      model_name: 'video',
      current_interval_remaining_percent: 10,
    },
    {
      model_name: 'general',
      current_interval_remaining_percent: 100,
      end_time: 1_775_000_000_000,
      current_weekly_status: 1,
      current_weekly_remaining_percent: 49,
      weekly_end_time: 1_775_100_000_000,
    },
  ],
};

describe('parseMinimaxWindows', () => {
  it('maps remaining percent to used percent for the general model', () => {
    const windows = parseMinimaxWindows(remainsBody);
    expect(windows).toEqual([
      expect.objectContaining({ id: 'fiveHour', usedPercent: 0, quotaPercent: 100 }),
      expect.objectContaining({ id: 'week', usedPercent: 51, quotaPercent: 100 }),
    ]);
  });

  it('skips weekly window when status is not active', () => {
    const windows = parseMinimaxWindows({
      model_remains: [
        {
          model_name: 'general',
          current_interval_remaining_percent: 80,
          current_weekly_status: 3,
          current_weekly_remaining_percent: 100,
        },
      ],
    });
    expect(windows.map((w) => w.id)).toEqual(['fiveHour']);
    expect(windows[0]?.usedPercent).toBe(20);
  });
});

describe('fetchMinimaxRemains', () => {
  it('marks 401 as expired', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 401 }));
    const result = await fetchMinimaxRemains('sk-test', 'cn', fetchImpl);
    expect(result.success).toBe(false);
    expect(result.credentialStatus).toBe('expired');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.minimaxi.com/v1/api/openplatform/coding_plan/remains',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer sk-test' }),
      }),
    );
  });

  it('treats base_resp status_code != 0 as a business error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ base_resp: { status_code: 1004, status_msg: 'login fail' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const result = await fetchMinimaxRemains('sk-test', 'global', fetchImpl);
    expect(result.success).toBe(false);
    expect(result.credentialStatus).toBe('error');
    expect(result.error).toContain('1004');
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      'https://api.minimax.io/v1/api/openplatform/coding_plan/remains',
    );
  });

  it('returns parsed windows on success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(remainsBody), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const result = await fetchMinimaxRemains('sk-test', 'cn', fetchImpl);
    expect(result.success).toBe(true);
    expect(result.windows).toHaveLength(2);
  });
});
