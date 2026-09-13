import { useEffect, useState } from 'react';
import { resolveGatewayColor } from '../gateways/colors.js';
import { formatMoney, formatTokens } from './formatMoney.js';
import { formatResetIn, usedBarPercent } from './formatReset.js';
import type { UsageProvider, UsageWindow } from '../../types.js';

export function UsageCard({
  provider,
  onConfigure,
}: {
  provider: UsageProvider;
  onConfigure?: (provider: UsageProvider) => void;
}): JSX.Element {
  const color = resolveGatewayColor(provider.color);
  const now = useNow(true);
  const kindLabel = provider.kind === 'package' ? '套餐' : 'API';

  return (
    <article className={`gcp-card gcp-card-${color}`} data-testid={`usage-${provider.id}`}>
      <div className="title">
        <span className="title-name">
          <span>{provider.name}</span>
          {onConfigure && (
            <button
              type="button"
              className="gcp-gear"
              aria-label={`Configure ${provider.name}`}
              data-testid={`configure-usage-${provider.id}`}
              onClick={() => onConfigure(provider)}
            >
              <GearIcon />
            </button>
          )}
        </span>
        <span className="title-meta">
          <span className={`badge ${provider.kind === 'package' ? 'ok' : 'warn'}`}>{kindLabel}</span>
        </span>
      </div>
      {provider.lastError && (
        <div className="field">
          <span>status</span>
          <span className="value">{provider.lastError}</span>
        </div>
      )}
      {provider.kind === 'package' && (provider.windows ?? []).map((window) => (
        <QuotaWindow key={window.id} window={window} now={now} />
      ))}
      {provider.kind === 'api' && provider.balance !== undefined && (
        <div className="gcp-usage-today" data-testid={`balance-${provider.id}`}>
          <span>余额</span>
          <span className="value">{formatMoney(provider.balance, provider.currency)}</span>
        </div>
      )}
      {(provider.todayTokens !== undefined || provider.todayCost !== undefined) && (
        <div className="gcp-usage-today" data-testid={`today-${provider.id}`}>
          <span>今日</span>
          <span className="value">
            {formatTokens(provider.todayTokens)} · {formatMoney(provider.todayCost, provider.currency)}
          </span>
        </div>
      )}
    </article>
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

function QuotaWindow({ window, now }: { window: UsageWindow; now: number }): JSX.Element {
  const used = usedBarPercent(window.usedPercent);
  const tone = used >= 90 ? 'low' : used >= 75 ? 'mid' : 'ok';

  return (
    <div className="gcp-quota" data-testid={`quota-${window.id}`}>
      <div className="gcp-quota-row">
        <strong>{window.label}</strong>
        <span>额度 {window.quotaPercent}%</span>
      </div>
      <div className="gcp-quota-row gcp-quota-meta">
        <span>{formatResetIn(window.resetAt, now)}</span>
        <span>已用 {window.usedPercent}%</span>
      </div>
      <div className="gcp-quota-bar" aria-hidden="true">
        <i className={`gcp-quota-fill gcp-quota-fill-${tone}`} style={{ width: `${used}%` }} />
      </div>
    </div>
  );
}

function useNow(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return undefined;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [enabled]);
  return now;
}
