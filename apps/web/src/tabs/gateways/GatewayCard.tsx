import { useEffect, useState } from 'react';
import { resolveGatewayColor } from './colors.js';
import { formatHealthAge } from './healthAge.js';
import { resolveOpenUrl } from './openUrl.js';
import type { Gateway, GatewayStatus } from '../../types.js';

interface GatewayCardProps {
  status: GatewayStatus;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onConfigure?: (gateway: Gateway) => void;
  busy: boolean;
}

export function GatewayCard({ status, onStart, onStop, onConfigure, busy }: GatewayCardProps): JSX.Element {
  const { gateway, running, pid, health, lastError } = status;
  const openUrl = resolveOpenUrl(gateway);
  const now = useNow(health !== undefined);
  const color = resolveGatewayColor(gateway.color);
  const watermark = gateway.watermark?.trim() || gateway.name;

  const stateBadge = running
    ? { label: '运行中', cls: 'ok' }
    : { label: '已停止', cls: 'warn' };
  const healthLabel = health
    ? `${health.ok ? `正常 (${health.httpCode})` : `异常 (${health.error ?? '未知'})`} · ${formatHealthAge(health.at, now)}`
    : running
      ? '进程运行中'
      : '进程未运行';

  return (
    <article
      className={`gcp-card gcp-card-${color}`}
      data-testid={`card-${gateway.id}`}
      data-watermark={watermark}
    >
      <svg
        className="gcp-card-watermark"
        viewBox="0 0 100 96"
        preserveAspectRatio="none"
        aria-hidden="true"
        data-testid={`watermark-${gateway.id}`}
      >
        <text x="50" y="80" textAnchor="middle" textLength="92" lengthAdjust="spacingAndGlyphs">
          {watermark}
        </text>
      </svg>
      <div className="title">
        <span className="title-name">
          <span>{gateway.name}</span>
          {onConfigure && (
            <button
              type="button"
              className="gcp-gear"
              aria-label={`配置 ${gateway.name}`}
              data-testid={`configure-${gateway.id}`}
              onClick={() => onConfigure(gateway)}
            >
              <GearIcon />
            </button>
          )}
        </span>
        <span className="title-meta">
          <span className={`badge ${stateBadge.cls}`} data-testid={`state-${gateway.id}`}>
            {stateBadge.label}
          </span>
          {(running || health?.ok) && openUrl && (
            <a
              className="open-link"
              href={openUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid={`open-${gateway.id}`}
            >
              打开
            </a>
          )}
        </span>
      </div>
      <div className="gcp-meta">
        <Field label="标识" value={gateway.id} />
        <Field label="进程号" value={pid} />
        <Field label="端口" value={gateway.port} />
        <Field label="地址" value={openUrl} />
        <Field label="健康状态" value={healthLabel} />
      </div>
      <div className="actions">
        <button
          data-testid={`start-${gateway.id}`}
          className="go"
          disabled={running || busy}
          onClick={() => onStart(gateway.id)}
        >
          启动
        </button>
        <button
          data-testid={`stop-${gateway.id}`}
          className="danger"
          disabled={!running || busy}
          onClick={() => {
            if (window.confirm(`确定要停止“${gateway.name}”吗？`)) {
              onStop(gateway.id);
            }
          }}
        >
          停止
        </button>
      </div>
      {lastError && (
        <div className="field">
          <span>最后错误</span>
          <span className="value">{lastError}</span>
        </div>
      )}
    </article>
  );
}

function Field({ label, value }: { label: string; value?: string | number }): JSX.Element {
  return (
    <div className="field">
      <span>{label}</span>
      <span className="value">{value ?? ''}</span>
    </div>
  );
}

function GearIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6.2 1.3h3.6l.3 1.5c.4.1.8.3 1.2.6l1.4-.6 1.8 3.1-1.2 1c.1.4.1.8 0 1.2l1.2 1-1.8 3.1-1.4-.6c-.4.3-.8.5-1.2.6l-.3 1.5H6.2l-.3-1.5a5 5 0 0 1-1.2-.6l-1.4.6L1.5 9.1l1.2-1a4 4 0 0 1 0-1.2l-1.2-1 1.8-3.1 1.4.6c.4-.3.8-.5 1.2-.6l.3-1.5zM8 10.1A2.1 2.1 0 1 0 8 5.9a2.1 2.1 0 0 0 0 4.2z"
      />
    </svg>
  );
}

function useNow(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [enabled]);
  return now;
}
