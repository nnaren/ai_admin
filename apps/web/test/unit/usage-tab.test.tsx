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
});
