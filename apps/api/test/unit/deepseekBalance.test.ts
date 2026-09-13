import { describe, expect, it, vi } from 'vitest';
import { fetchDeepSeekBalance, parseDeepSeekBalances } from '../../src/services/deepseekBalance.js';

const balanceBody = {
  is_available: true,
  balance_infos: [
    {
      currency: 'CNY',
      total_balance: '110.50',
      granted_balance: '10.50',
      topped_up_balance: '100.00',
    },
  ],
};

describe('parseDeepSeekBalances', () => {
  it('parses string balance values returned by DeepSeek', () => {
    expect(parseDeepSeekBalances(balanceBody)).toEqual([
      {
        currency: 'CNY',
        totalBalance: 110.5,
        grantedBalance: 10.5,
        toppedUpBalance: 100,
      },
    ]);
  });
});

describe('fetchDeepSeekBalance', () => {
  it('queries the balance endpoint with a bearer API key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(balanceBody), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await fetchDeepSeekBalance('sk-test', fetchImpl);

    expect(result.success).toBe(true);
    expect(result.credentialStatus).toBe('valid');
    expect(result.balances[0]?.totalBalance).toBe(110.5);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.deepseek.com/user/balance',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer sk-test' }),
      }),
    );
  });

  it('marks rejected credentials as expired', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 401 }));
    const result = await fetchDeepSeekBalance('sk-test', fetchImpl);
    expect(result.success).toBe(false);
    expect(result.credentialStatus).toBe('expired');
  });
});
