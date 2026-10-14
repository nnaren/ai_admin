import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { UsageTab } from '../../src/tabs/usage/UsageTab.js';

vi.mock('../../src/api/client.js', () => ({
  listUsage: vi.fn(),
  addUsageAccount: vi.fn(),
  updateUsageAccount: vi.fn(),
}));

import { listUsage } from '../../src/api/client.js';

describe('UsageTab', () => {
  beforeEach(() => {
    vi.mocked(listUsage).mockReset();
  });

  it('renders provider cards from the usage API', async () => {
    vi.mocked(listUsage).mockResolvedValue([
      { id: 'anthropic', provider: 'Anthropic', kind: 'package' },
    ]);
    render(<UsageTab />);
    const card = await screen.findByTestId('usage-anthropic');
    const addButton = screen.getByTestId('add-account');
    expect(addButton).toHaveTextContent('添加模型账号');
    expect(addButton.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows an empty hint when no providers are configured', async () => {
    vi.mocked(listUsage).mockResolvedValue([]);
    render(<UsageTab />);
    await waitFor(() => {
      expect(screen.getByText(/还没有模型账号/)).toBeInTheDocument();
    });
    expect(screen.queryByTestId('usage-anthropic')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('add-account'));
    expect(screen.getByTestId('add-account-form')).toBeInTheDocument();
  });

  it('refreshes providers when the refresh button is clicked', async () => {
    vi.mocked(listUsage)
      .mockResolvedValueOnce([{ id: 'anthropic', provider: 'Anthropic', kind: 'package' }])
      .mockResolvedValueOnce([
        { id: 'anthropic', provider: 'Anthropic', kind: 'package' },
        { id: 'deepseek', provider: 'DeepSeek', kind: 'api' },
      ]);
    render(<UsageTab />);
    await screen.findByTestId('usage-anthropic');
    expect(listUsage).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('refresh-usage'));
    await screen.findByTestId('usage-deepseek');
    expect(listUsage).toHaveBeenCalledTimes(2);
  });

  it('shows how long ago the data was refreshed', async () => {
    vi.mocked(listUsage).mockResolvedValue([
      {
        id: 'deepseek',
        provider: 'DeepSeek',
        kind: 'api',
        refreshedAt: new Date(Date.now() - 3 * 60_000).toISOString(),
      },
    ]);
    render(<UsageTab />);
    await screen.findByTestId('usage-deepseek');
    expect(screen.getByTestId('usage-refreshed')).toHaveTextContent('3分钟前更新');
  });

  it('shows a placeholder before the first response arrives', () => {
    vi.mocked(listUsage).mockReturnValue(new Promise(() => {}));
    render(<UsageTab />);
    expect(screen.getByTestId('usage-refreshed')).toHaveTextContent('未刷新');
  });

  it('shares one time dimension across every card', async () => {
    vi.mocked(listUsage).mockResolvedValue([
      {
        id: 'a',
        provider: 'DeepSeek',
        kind: 'api',
        balances: [{ currency: 'CNY', totalBalance: 10 }],
        spend: {
          today: { currency: 'CNY', amount: 1, since: '2026-10-14T00:00:01.000Z' },
          yesterday: { currency: 'CNY', amount: 2, since: '2026-10-13T00:00:01.000Z' },
          last7d: null,
          last30d: null,
          thisMonth: null,
          lastMonth: null,
        },
      },
      {
        id: 'b',
        provider: 'DeepSeek-B',
        kind: 'api',
        balances: [{ currency: 'CNY', totalBalance: 5 }],
        spend: {
          today: { currency: 'CNY', amount: 3, since: '2026-10-14T00:00:01.000Z' },
          yesterday: null,
          last7d: null,
          last30d: null,
          thisMonth: null,
          lastMonth: null,
        },
      },
    ]);
    render(<UsageTab />);
    await screen.findByTestId('usage-a');
    expect(screen.getByTestId('spend-a')).toHaveTextContent('¥1.00');

    fireEvent.change(screen.getByTestId('range-a'), { target: { value: 'yesterday' } });
    expect(screen.getByTestId('range-b')).toHaveValue('yesterday');
    expect(screen.getByTestId('spend-a')).toHaveTextContent('¥2.00');
    expect(screen.getByTestId('spend-b')).toHaveTextContent('—');
  });
});
