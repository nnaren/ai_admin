import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GatewayForm } from '../../src/tabs/gateways/GatewayForm.js';

describe('GatewayForm', () => {
  it('prefills edit fields and keeps the internal id hidden', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();
    render(
      <GatewayForm
        initial={{
          id: 'dsh',
          name: 'dsh web',
          watermark: 'DSH',
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
    expect(screen.queryByText('标识（ID）')).not.toBeInTheDocument();
    expect(screen.getByTestId('add-name')).toHaveValue('dsh web');
    expect(screen.getByTestId('add-watermark')).toHaveValue('DSH');
    expect(screen.getByTestId('color-blue')).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(screen.getByTestId('color-green'));
    fireEvent.submit(screen.getByTestId('edit-form'));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'dsh',
        watermark: 'DSH',
        color: 'green',
        healthUrl: 'http://127.0.0.1:3080/',
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('generates an internal id when adding a gateway', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<GatewayForm onSubmit={onSubmit} onCancel={() => {}} />);

    expect(screen.queryByText('标识（ID）')).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('add-name'), { target: { value: 'New Gateway' } });
    fireEvent.change(screen.getByTestId('add-start'), { target: { value: 'run-gateway' } });
    fireEvent.submit(screen.getByTestId('add-form'));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringMatching(/^gw-[a-z0-9]{8}$/),
        name: 'New Gateway',
      }),
    );
  });
});
