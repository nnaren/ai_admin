import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GatewayForm } from '../../src/tabs/gateways/GatewayForm.js';

describe('GatewayForm', () => {
  it('prefills edit fields and keeps id locked', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();
    render(
      <GatewayForm
        initial={{
          id: 'dsh',
          name: 'dsh web',
          startCommand: 'dsh web',
          port: 3080,
          openUrl: 'http://127.0.0.1:3080/',
          color: 'blue',
          healthUrl: 'http://127.0.0.1:3080/',
        }}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByTestId('gateway-modal')).toBeInTheDocument();
    expect(screen.getByTestId('edit-form')).toBeInTheDocument();
    expect(screen.getByTestId('add-id')).toHaveValue('dsh');
    expect(screen.getByTestId('add-id')).toBeDisabled();
    expect(screen.getByTestId('add-name')).toHaveValue('dsh web');
    expect(screen.getByTestId('color-blue')).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(screen.getByTestId('color-green'));
    fireEvent.submit(screen.getByTestId('edit-form'));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'dsh',
        color: 'green',
        healthUrl: 'http://127.0.0.1:3080/',
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
