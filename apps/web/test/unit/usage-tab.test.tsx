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
      { id: 'anthropic', name: 'Anthropic', kind: 'package' },
    ]);
    render(<UsageTab />);
    expect(await screen.findByTestId('usage-anthropic')).toBeInTheDocument();
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
});
