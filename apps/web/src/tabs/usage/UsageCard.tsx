import { useEffect, useState } from 'react';
import { resolveGatewayColor } from '../gateways/colors.js';
import { splitMoney, type MoneyParts } from './formatMoney.js';
import { formatResetIn, usedBarPercent } from './formatReset.js';
import {
  formatSpendTitle,
  USAGE_RANGES,
  USAGE_RANGE_LABELS,
  type UsageRange,
} from './usageRanges.js';
import type { UsageProvider, UsageWindow } from '../../types.js';

export function UsageCard({
  provider,
  onConfigure,
  range = 'today',
  onRangeChange,
}: {
  provider: UsageProvider;
  onConfigure?: (provider: UsageProvider) => void;
  /** Selected time dimension; shared by every card so they switch together. */
  range?: UsageRange;
  onRangeChange?: (range: UsageRange) => void;
}): JSX.Element {
  const color = resolveGatewayColor(provider.color);
  const now = useNow(true);
  const kindLabel = provider.kind === 'package' ? '套餐' : 'API';
  const officialUsageUrl = getOfficialUsageUrl(provider.usageUrl);
  const watermark = provider.watermark?.trim() || provider.provider;
  const spend =
    provider.spend?.[range] ??
    // Legacy payload without `spend`: only 今天 had a value.
    (range === 'today' && provider.todayCost !== undefined
      ? { currency: provider.currency ?? 'CNY', amount: provider.todayCost, since: '' }
      : null);

  return (
    <article
      className={`gcp-card gcp-usage-card gcp-card-${color}`}
      data-testid={`usage-${provider.id}`}
      data-watermark={watermark}
    >
      <svg
        className="gcp-card-watermark"
        viewBox="0 0 100 96"
        preserveAspectRatio="none"
        aria-hidden="true"
        data-testid={`usage-watermark-${provider.id}`}
      >
        <text x="50" y="80" textAnchor="middle" textLength="92" lengthAdjust="spacingAndGlyphs">
          {watermark}
        </text>
      </svg>
      <div className="title">
        <span className="title-name">
          <span>{provider.provider}</span>
          {onConfigure && (
            <button
              type="button"
              className="gcp-gear"
              aria-label={`配置 ${provider.provider}`}
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
          <span>状态</span>
          <span className="value">{provider.lastError}</span>
        </div>
      )}
      {provider.kind === 'package' && (provider.windows ?? []).map((window) => (
        <QuotaWindow key={window.id} window={window} now={now} />
      ))}
      {provider.kind === 'api' && (provider.balances ?? []).map((balance) => (
        <div
          className="gcp-usage-today"
          data-testid={`balance-${provider.id}-${balance.currency.toLowerCase()}`}
          key={balance.currency}
        >
          <span>余额（{balance.currency}）</span>
          <span className="value gcp-usage-money">
            <Money value={splitMoney(balance.totalBalance, balance.currency)} />
          </span>
        </div>
      ))}
      {provider.kind === 'api' && !(provider.balances?.length) && provider.balance !== undefined && (
        <div className="gcp-usage-today" data-testid={`balance-${provider.id}`}>
          <span>余额</span>
          <span className="value gcp-usage-money">
            <Money value={splitMoney(provider.balance, provider.currency)} />
          </span>
        </div>
      )}
      {provider.spend !== undefined && (
        <div
          className="gcp-usage-spend"
          data-testid={`today-${provider.id}`}
          title={spend ? formatSpendTitle(spend, USAGE_RANGE_LABELS[range]) : '暂无消费记录'}
        >
          <span className="gcp-usage-spend-label">消费金额</span>
          <select
            className="gcp-usage-range"
            data-testid={`range-${provider.id}`}
            aria-label={`${provider.provider} 消费时间维度`}
            value={range}
            onChange={(e) => onRangeChange?.(e.target.value as UsageRange)}
          >
            {USAGE_RANGES.map((item) => (
              <option key={item} value={item}>
                {USAGE_RANGE_LABELS[item]}
              </option>
            ))}
          </select>
          <span className="value gcp-usage-money" data-testid={`spend-${provider.id}`}>
            {spend ? <Money value={splitMoney(spend.amount, spend.currency)} /> : '—'}
          </span>
        </div>
      )}
      {officialUsageUrl && (
        <div className="gcp-usage-link-row">
          <a
            className="gcp-usage-link"
            href={officialUsageUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid={`official-usage-${provider.id}`}
          >
            官网查看用量
          </a>
        </div>
      )}
    </article>
  );
}

/**
 * Money split into pieces: the symbol keeps the label color, only the number
 * itself carries the emphasis color. Must stay wrapped in a single element by the
 * caller — as loose siblings inside a `space-between` row they get pushed apart.
 */
function Money({ value }: { value: MoneyParts }): JSX.Element {
  return (
    <>
      <span className="gcp-money-sign">{value.symbol}</span>
      <span className="gcp-money-amount">{value.amount}</span>
    </>
  );
}

function getOfficialUsageUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
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
  const resetText = formatResetIn(window.resetAt, now);
  const resetSuffix = '后重置';
  const resetTime = resetText.endsWith(resetSuffix)
    ? resetText.slice(0, -resetSuffix.length)
    : undefined;

  return (
    <div className="gcp-quota" data-testid={`quota-${window.id}`}>
      <div className="gcp-quota-row">
        <strong>{window.label}</strong>
        <span>额度 {window.quotaPercent}%</span>
      </div>
      <div className="gcp-quota-row gcp-quota-meta">
        <span>
          {resetTime ? (
            <>
              <span className="gcp-quota-reset-time">{resetTime}</span>
              {resetSuffix}
            </>
          ) : (
            resetText
          )}
        </span>
        <span>
          已用 <span className="gcp-quota-used">{window.usedPercent}%</span>
        </span>
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
