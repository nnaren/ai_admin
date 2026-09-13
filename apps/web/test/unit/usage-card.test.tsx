import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { UsageCard } from '../../src/tabs/usage/UsageCard.js';

describe('UsageCard', () => {
  it('shows package windows and today spend', () => {
    render(
      <UsageCard
        provider={{
          id: 'anthropic',
          name: 'Anthropic',
          kind: 'package',
          color: 'amber',
          todayTokens: 0,
          todayCost: 0,
          windows: [
            {
              id: 'fiveHour',
              label: '5h 限额',
              resetAt: '2099-01-01T00:00:00Z',
              quotaPercent: 100,
              usedPercent: 0,
            },
            {
              id: 'week',
              label: '周限额',
              resetAt: '2099-01-02T00:00:00Z',
              quotaPercent: 150,
              usedPercent: 51,
            },
          ],
        }}
      />,
    );

    expect(screen.getByText('Anthropic')).toBeInTheDocument();
    expect(screen.getByText('套餐')).toBeInTheDocument();
    expect(screen.getByText('5h 限额')).toBeInTheDocument();
    expect(screen.getByText('周限额')).toBeInTheDocument();
    expect(screen.getByText('额度 150%')).toBeInTheDocument();
    expect(screen.getByText('已用 51%')).toBeInTheDocument();
    expect(screen.getByTestId('quota-fiveHour').querySelector('.gcp-quota-fill')).toHaveStyle({
      width: '0%',
    });
    expect(screen.getByTestId('quota-week').querySelector('.gcp-quota-fill')).toHaveStyle({
      width: '51%',
    });
    expect(screen.getByTestId('today-anthropic')).toHaveTextContent('0 tokens');
    expect(screen.getByTestId('today-anthropic')).toHaveTextContent('$0.00');
  });

  it('shows API balance instead of quota windows', () => {
    render(
      <UsageCard
        provider={{
          id: 'deepseek',
          name: 'DeepSeek',
          kind: 'api',
          todayTokens: 23400,
          todayCost: 0.12,
          balance: 16.8,
        }}
      />,
    );

    expect(screen.getByText('API')).toBeInTheDocument();
    expect(screen.getByTestId('balance-deepseek')).toHaveTextContent('$16.80');
    expect(screen.queryByText('5h 限额')).not.toBeInTheDocument();
    expect(screen.getByTestId('today-deepseek')).toHaveTextContent('23,400 tokens');
  });

  it('opens configure from the gear', () => {
    const onConfigure = vi.fn();
    render(
      <UsageCard
        provider={{ id: 'minimax-cn', name: 'MiniMax', kind: 'package' }}
        onConfigure={onConfigure}
      />,
    );
    fireEvent.click(screen.getByTestId('configure-usage-minimax-cn'));
    expect(onConfigure).toHaveBeenCalledWith(expect.objectContaining({ id: 'minimax-cn' }));
  });
});
