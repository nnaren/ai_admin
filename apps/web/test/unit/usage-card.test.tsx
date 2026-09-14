import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { UsageCard } from '../../src/tabs/usage/UsageCard.js';

describe('UsageCard', () => {
  it('shows package windows and today spend', () => {
    render(
      <UsageCard
        provider={{
          id: 'anthropic',
          provider: 'Anthropic',
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

    expect(screen.getByTestId('usage-anthropic').querySelector('.title-name')).toHaveTextContent('Anthropic');
    expect(screen.getByTestId('usage-anthropic')).toHaveAttribute('data-watermark', 'Anthropic');
    expect(screen.getByTestId('usage-watermark-anthropic').querySelector('text')).toHaveTextContent('Anthropic');
    expect(screen.getByText('套餐')).toBeInTheDocument();
    expect(screen.getByText('5h 限额')).toBeInTheDocument();
    expect(screen.getByText('周限额')).toBeInTheDocument();
    expect(document.querySelector('.gcp-quota-reset-time')).toBeInTheDocument();
    expect(document.querySelector('.gcp-quota-reset-time')).not.toHaveTextContent('后重置');
    expect(screen.getByText('额度 150%')).toBeInTheDocument();
    expect(screen.getByTestId('quota-week')).toHaveTextContent('已用 51%');
    expect(screen.getByTestId('quota-week').querySelector('.gcp-quota-used')).toHaveTextContent('51%');
    expect(screen.getByTestId('quota-fiveHour').querySelector('.gcp-quota-fill')).toHaveStyle({
      width: '0%',
    });
    expect(screen.getByTestId('quota-week').querySelector('.gcp-quota-fill')).toHaveStyle({
      width: '51%',
    });
    expect(screen.getByTestId('today-anthropic')).toHaveTextContent('0 tokens');
    expect(screen.getByTestId('today-anthropic')).toHaveTextContent('$0.00');
    expect(screen.queryByText('官网查看用量')).not.toBeInTheDocument();
  });

  it('shows API balance instead of quota windows', () => {
    render(
      <UsageCard
        provider={{
          id: 'deepseek',
          provider: 'DeepSeek',
          watermark: 'DEEPSEEK',
          kind: 'api',
          usageUrl: 'https://platform.deepseek.com/usage',
          todayTokens: 23400,
          todayCost: 0.12,
          balances: [{ currency: 'CNY', totalBalance: 16.8 }],
        }}
      />,
    );

    expect(screen.getByText('API')).toBeInTheDocument();
    expect(screen.getByTestId('usage-deepseek')).toHaveAttribute('data-watermark', 'DEEPSEEK');
    expect(screen.getByTestId('balance-deepseek-cny')).toHaveTextContent('余额（CNY）');
    expect(screen.getByTestId('balance-deepseek-cny')).toHaveTextContent('¥16.80');
    expect(screen.getByTestId('balance-deepseek-cny').querySelector('.gcp-usage-money')).toHaveTextContent(
      '¥16.80',
    );
    expect(screen.queryByText('5h 限额')).not.toBeInTheDocument();
    expect(screen.getByTestId('today-deepseek')).toHaveTextContent('23,400 tokens');
    expect(screen.getByTestId('today-deepseek').querySelector('.gcp-usage-money')).toHaveTextContent('$0.12');
    expect(screen.getByTestId('official-usage-deepseek')).toHaveAttribute(
      'href',
      'https://platform.deepseek.com/usage',
    );
  });

  it('opens configure from the gear', () => {
    const onConfigure = vi.fn();
    render(
      <UsageCard
        provider={{
          id: 'minimax-cn',
          provider: 'MiniMax',
          kind: 'package',
          usageUrl: 'https://platform.minimax.cn/console/usage',
        }}
        onConfigure={onConfigure}
      />,
    );
    fireEvent.click(screen.getByTestId('configure-usage-minimax-cn'));
    expect(onConfigure).toHaveBeenCalledWith(expect.objectContaining({ id: 'minimax-cn' }));
    expect(screen.getByTestId('official-usage-minimax-cn')).toHaveAttribute(
      'href',
      'https://platform.minimax.cn/console/usage',
    );
  });
});
