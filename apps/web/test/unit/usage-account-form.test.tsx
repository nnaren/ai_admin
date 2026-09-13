import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { UsageAccountForm } from '../../src/tabs/usage/UsageAccountForm.js';

describe('UsageAccountForm', () => {
  it('submits a MiniMax account', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<UsageAccountForm onSubmit={onSubmit} onCancel={() => {}} />);
    expect(screen.queryByTestId('account-id')).not.toBeInTheDocument();
    expect(screen.queryByTestId('account-name')).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('account-provider'), { target: { value: 'MiniMax' } });
    fireEvent.change(screen.getByTestId('account-key'), { target: { value: 'sk-test' } });
    fireEvent.submit(screen.getByTestId('add-account-form'));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringMatching(/^usage-[a-z0-9]{8}$/),
        provider: 'MiniMax',
        watermark: 'MiniMax',
        region: 'cn',
        kind: 'package',
        apiKey: 'sk-test',
      }),
    );
  });

  it('uses API balance mode for DeepSeek while keeping generic region labels', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<UsageAccountForm onSubmit={onSubmit} onCancel={() => {}} />);

    fireEvent.change(screen.getByTestId('account-provider'), { target: { value: 'DeepSeek' } });
    expect(screen.getByTestId('account-kind')).toHaveValue('api');
    expect(screen.getByTestId('account-kind')).toBeDisabled();
    expect(screen.getByRole('option', { name: '国内' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '国外' })).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('account-usage-url'), {
      target: { value: 'https://platform.deepseek.com/usage' },
    });
    fireEvent.change(screen.getByTestId('account-key'), { target: { value: 'sk-deepseek' } });
    fireEvent.submit(screen.getByTestId('add-account-form'));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'DeepSeek',
        region: 'cn',
        kind: 'api',
        usageUrl: 'https://platform.deepseek.com/usage',
        apiKey: 'sk-deepseek',
      }),
    );
  });
});
