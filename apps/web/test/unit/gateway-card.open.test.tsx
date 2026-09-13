import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GatewayCard } from '../../src/tabs/gateways/GatewayCard.js';
import type { GatewayStatus } from '../../src/types.js';

function status(partial: Partial<GatewayStatus> & { running: boolean }): GatewayStatus {
  return {
    gateway: {
      id: 'dsh',
      name: 'dsh web',
      watermark: 'DSH',
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
    expect(screen.getByText(/正常 \(200\) · 1分钟前/)).toBeInTheDocument();
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
    expect(screen.getByText('健康状态')).toBeInTheDocument();
    expect(screen.getByText('端口')).toBeInTheDocument();
    expect(screen.getByText('地址')).toBeInTheDocument();
    expect(screen.getByText('进程未运行')).toBeInTheDocument();
    expect(screen.queryByText(/正常 \(/)).not.toBeInTheDocument();
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

  it('adds a DSH watermark to the dsh card', () => {
    render(
      <GatewayCard
        status={status({ running: true, pid: 1 })}
        onStart={() => {}}
        onStop={() => {}}
        busy={false}
      />,
    );

    expect(screen.getByTestId('card-dsh')).toHaveAttribute('data-watermark', 'DSH');
    const watermark = screen.getByTestId('watermark-dsh');
    expect(watermark).toHaveAttribute('viewBox', '0 0 100 96');
    expect(watermark.querySelector('text')).toHaveAttribute('textLength', '92');
  });

  it('uses the gateway name when no watermark is configured', () => {
    render(
      <GatewayCard
        status={{
          gateway: { id: 'bare', name: 'Bare Gateway', startCommand: 'sleep 1' },
          running: false,
        }}
        onStart={() => {}}
        onStop={() => {}}
        busy={false}
      />,
    );

    expect(screen.getByTestId('card-bare')).toHaveAttribute('data-watermark', 'Bare Gateway');
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
    expect(screen.getByText('进程运行中')).toBeInTheDocument();
  });

  it('asks for confirmation before stopping', () => {
    const onStop = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <GatewayCard
        status={status({ running: true, pid: 1 })}
        onStart={() => {}}
        onStop={onStop}
        busy={false}
      />,
    );

    fireEvent.click(screen.getByTestId('stop-dsh'));

    expect(confirm).toHaveBeenCalledWith('确定要停止“dsh web”吗？');
    expect(onStop).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);

    fireEvent.click(screen.getByTestId('stop-dsh'));

    expect(onStop).toHaveBeenCalledWith('dsh');
  });
});
