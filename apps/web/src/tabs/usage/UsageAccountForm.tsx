import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { UsageAccount, UsageKind, UsageProvider, UsageRegion } from '../../types.js';
import type { GatewayColor } from '../gateways/colors.js';
import { resolveGatewayColor } from '../gateways/colors.js';
import { ColorSwatches } from '../gateways/ColorSwatches.js';

interface UsageAccountFormProps {
  initial?: UsageProvider;
  onSubmit: (account: UsageAccount) => Promise<void>;
  onCancel: () => void;
}

export function UsageAccountForm({ initial, onSubmit, onCancel }: UsageAccountFormProps): JSX.Element {
  const editing = initial !== undefined;
  const [id] = useState(() => initial?.id ?? createUsageAccountId());
  const [provider, setProvider] = useState(initial?.provider ?? '');
  const [watermark, setWatermark] = useState(initial?.watermark ?? '');
  const [region, setRegion] = useState<UsageRegion>(initial?.region === 'global' ? 'global' : 'cn');
  const [kind, setKind] = useState<UsageKind>(initial?.kind ?? 'package');
  const [usageUrl, setUsageUrl] = useState(initial?.usageUrl ?? '');
  const [apiKey, setApiKey] = useState('');
  const [color, setColor] = useState<GatewayColor>(resolveGatewayColor(initial?.color));
  const deepSeek = isProvider(provider, 'deepseek');

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return createPortal(
    <div
      className="gcp-modal"
      data-testid="account-modal"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <form
        data-testid={editing ? 'edit-account-form' : 'add-account-form'}
        className="gcp-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gcp-account-title"
        onSubmit={(e) => {
          e.preventDefault();
          if (!provider.trim()) return;
          if (!editing && !apiKey) return;
          void onSubmit({
            id,
            provider: provider.trim(),
            watermark: watermark.trim() || provider.trim(),
            region,
            kind: deepSeek ? 'api' : kind,
            color,
            usageUrl: usageUrl.trim() || undefined,
            apiKey: apiKey || undefined,
          });
        }}
      >
        <div className="gcp-modal-head">
          <h2 id="gcp-account-title">{editing ? '配置模型账号' : '添加模型账号'}</h2>
          <button type="button" className="gcp-modal-close" aria-label="关闭" onClick={onCancel}>
            ×
          </button>
        </div>
        <label>
          提供商
          <input
            data-testid="account-provider"
            value={provider}
            onChange={(e) => {
              const value = e.target.value;
              setProvider(value);
              if (isProvider(value, 'deepseek')) setKind('api');
            }}
            required
            placeholder="例如 MiniMax、DeepSeek"
            list="usage-providers"
          />
          <datalist id="usage-providers">
            <option value="MiniMax" />
            <option value="DeepSeek" />
          </datalist>
        </label>
        <label>
          水印名称
          <input
            data-testid="account-watermark"
            value={watermark}
            onChange={(e) => setWatermark(e.target.value)}
            placeholder={provider || '例如 DeepSeek'}
          />
        </label>
        <label>
          区域
          <select data-testid="account-region" value={region} onChange={(e) => setRegion(e.target.value as UsageRegion)}>
            <option value="cn">国内</option>
            <option value="global">国外</option>
          </select>
        </label>
        <label>
          类型
          <select
            data-testid="account-kind"
            value={deepSeek ? 'api' : kind}
            onChange={(e) => setKind(e.target.value as UsageKind)}
            disabled={deepSeek}
          >
            <option value="package">套餐</option>
            <option value="api">API</option>
          </select>
        </label>
        <label>
          官网用量地址（可选）
          <input
            data-testid="account-usage-url"
            type="url"
            value={usageUrl}
            onChange={(e) => setUsageUrl(e.target.value)}
            placeholder="https://platform.example.com/usage"
          />
        </label>
        <label>
          API key
          <input
            data-testid="account-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            required={!editing}
            placeholder={editing && initial?.hasKey ? '已保存，留空则不修改' : ''}
            autoComplete="off"
          />
        </label>
        <div>
          <span>颜色</span>
          <ColorSwatches value={color} onChange={setColor} />
        </div>
        <div className="gcp-modal-actions">
          <button type="button" onClick={onCancel}>
            取消
          </button>
          <button type="submit" data-testid="account-submit">
            保存
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

function createUsageAccountId(): string {
  const suffix = globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Math.random().toString(36).slice(2, 10);
  return `usage-${suffix}`;
}

function isProvider(provider: string, expected: string): boolean {
  return provider.trim().toLowerCase() === expected;
}
