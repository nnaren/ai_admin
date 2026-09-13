import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GatewayCard } from '../../src/tabs/gateways/GatewayCard.js';
import type { GatewayStatus } from '../../src/types.js';

function status(partial: Partial<GatewayStatus> & { running: boolean }): GatewayStatus {
  return {
    gateway: {
      id: 'dsh',
      name: 'dsh web',
      startCommand: 'dsh web',
      port: 3080,
      healthUrl: 'http://127.0.0.1:3080/',
    },
    ...partial,
  };
}

describe('GatewayCard Open button', () => {
  it('shows Open next to running when a page URL exists', () => {
    render(
      <GatewayCard
        status={status({ running: true, pid: 1 })}
        onStart={() => {}}
        onStop={() => {}}
        busy={false}
      />,
    );
    const link = screen.getByTestId('open-dsh');
    expect(link).toHaveAttribute('href', 'http://127.0.0.1:3080');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('hides Open when stopped', () => {
    render(
      <GatewayCard
        status={status({ running: false })}
        onStart={() => {}}
        onStop={() => {}}
        busy={false}
      />,
    );
    expect(screen.queryByTestId('open-dsh')).not.toBeInTheDocument();
  });

  it('shows health age instead of a clock time', () => {
    render(
      <GatewayCard
        status={status({
          running: true,
          pid: 1,
          health: {
            ok: true,
            httpCode: 200,
            at: new Date(Date.now() - 90_000).toISOString(),
          },
        })}
        onStart={() => {}}
        onStop={() => {}}
        busy={false}
      />,
    );
    expect(screen.getByText(/ok \(200\) · 1m ago/)).toBeInTheDocument();
    expect(screen.queryByText(/\d{1,2}:\d{2}:\d{2}/)).not.toBeInTheDocument();
  });

  it('keeps health and other keys visible when values are empty', () => {
    render(
      <GatewayCard
        status={{
          gateway: { id: 'bare', name: 'Bare', startCommand: 'sleep 1' },
          running: false,
        }}
        onStart={() => {}}
        onStop={() => {}}
        busy={false}
      />,
    );
    expect(screen.getByText('health')).toBeInTheDocument();
    expect(screen.getByText('port')).toBeInTheDocument();
    expect(screen.getByText('url')).toBeInTheDocument();
    expect(screen.queryByText(/ok \(/)).not.toBeInTheDocument();
  });

  it('applies the configured card color', () => {
    const { container } = render(
      <GatewayCard
        status={status({
          running: true,
          pid: 1,
          gateway: {
            id: 'dsh',
            name: 'dsh web',
            startCommand: 'dsh web',
            port: 3080,
            healthUrl: 'http://127.0.0.1:3080/',
            color: 'blue',
          },
        })}
        onStart={() => {}}
        onStop={() => {}}
        busy={false}
      />,
    );
    expect(container.querySelector('.gcp-card-blue')).toBeInTheDocument();
  });

  it('opens configure via the gear instead of a color circle', () => {
    const onConfigure = vi.fn();
    render(
      <GatewayCard
        status={status({ running: true, pid: 1 })}
        onStart={() => {}}
        onStop={() => {}}
        onConfigure={onConfigure}
        busy={false}
      />,
    );
    expect(screen.queryByTestId('color-trigger')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('configure-dsh'));
    expect(onConfigure).toHaveBeenCalledWith(expect.objectContaining({ id: 'dsh' }));
  });

  it('hides Open when running but no page URL is configured', () => {
    render(
      <GatewayCard
        status={{
          gateway: { id: 'bare', name: 'Bare', startCommand: 'sleep 1' },
          running: true,
          pid: 2,
        }}
        onStart={() => {}}
        onStop={() => {}}
        busy={false}
      />,
    );
    expect(screen.queryByTestId('open-bare')).not.toBeInTheDocument();
  });
});
