import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { UsageAccountForm } from '../../src/tabs/usage/UsageAccountForm.js';

describe('UsageAccountForm', () => {
  it('submits a MiniMax account', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<UsageAccountForm onSubmit={onSubmit} onCancel={() => {}} />);
    fireEvent.change(screen.getByTestId('account-id'), { target: { value: 'minimax-cn' } });
    fireEvent.change(screen.getByTestId('account-name'), { target: { value: 'MiniMax' } });
    fireEvent.change(screen.getByTestId('account-key'), { target: { value: 'sk-test' } });
    fireEvent.submit(screen.getByTestId('add-account-form'));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'minimax-cn',
        name: 'MiniMax',
        provider: 'minimax',
        region: 'cn',
        kind: 'package',
        apiKey: 'sk-test',
      }),
    );
  });
});
