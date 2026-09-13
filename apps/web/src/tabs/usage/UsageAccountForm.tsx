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
  const [id, setId] = useState(initial?.id ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [region, setRegion] = useState<UsageRegion>(initial?.region === 'global' ? 'global' : 'cn');
  const [kind, setKind] = useState<UsageKind>(initial?.kind ?? 'package');
  const [apiKey, setApiKey] = useState('');
  const [color, setColor] = useState<GatewayColor>(resolveGatewayColor(initial?.color));

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
          if (!id || !name) return;
          if (!editing && !apiKey) return;
          void onSubmit({
            id,
            name,
            provider: 'minimax',
            region,
            kind,
            color,
            apiKey: apiKey || undefined,
          });
        }}
      >
        <div className="gcp-modal-head">
          <h2 id="gcp-account-title">{editing ? '配置模型账号' : '添加模型账号'}</h2>
          <button type="button" className="gcp-modal-close" aria-label="Close" onClick={onCancel}>
            ×
          </button>
        </div>
        <label>
          id{' '}
          <input
            data-testid="account-id"
            value={id}
            onChange={(e) => setId(e.target.value)}
            required
            disabled={editing}
          />
        </label>
        <label>
          name <input data-testid="account-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          提供商
          <select value="minimax" disabled>
            <option value="minimax">MiniMax</option>
          </select>
        </label>
        <label>
          区域
          <select data-testid="account-region" value={region} onChange={(e) => setRegion(e.target.value as UsageRegion)}>
            <option value="cn">国内 (api.minimaxi.com)</option>
            <option value="global">国际 (api.minimax.io)</option>
          </select>
        </label>
        <label>
          类型
          <select data-testid="account-kind" value={kind} onChange={(e) => setKind(e.target.value as UsageKind)}>
            <option value="package">套餐</option>
            <option value="api">API</option>
          </select>
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
          <span>color</span>
          <ColorSwatches value={color} onChange={setColor} />
        </div>
        <div className="gcp-modal-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" data-testid="account-submit">
            Save
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
