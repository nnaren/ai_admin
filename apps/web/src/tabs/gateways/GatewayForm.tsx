import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Gateway } from '../../types.js';
import type { GatewayColor } from './colors.js';
import { resolveGatewayColor } from './colors.js';
import { ColorSwatches } from './ColorSwatches.js';

interface GatewayFormProps {
  initial?: Gateway;
  onSubmit: (gw: Gateway) => Promise<void>;
  onCancel: () => void;
}

export function GatewayForm({ initial, onSubmit, onCancel }: GatewayFormProps): JSX.Element {
  const editing = initial !== undefined;
  const [id] = useState(() => initial?.id ?? createGatewayId());
  const [name, setName] = useState(initial?.name ?? '');
  const [watermark, setWatermark] = useState(initial?.watermark ?? '');
  const [startCommand, setStartCommand] = useState(initial?.startCommand ?? '');
  const [port, setPort] = useState(initial?.port != null ? String(initial.port) : '');
  const [openUrl, setOpenUrl] = useState(initial?.openUrl ?? '');
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
      data-testid="gateway-modal"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
    <form
      data-testid={editing ? 'edit-form' : 'add-form'}
      className="gcp-modal-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gcp-modal-title"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name || !startCommand) return;
        void onSubmit({
          ...initial,
          id,
          name,
          watermark: watermark.trim() || name,
          startCommand,
          port: port ? Number(port) : undefined,
          openUrl: openUrl || undefined,
          color,
        });
      }}
    >
      <div className="gcp-modal-head">
        <h2 id="gcp-modal-title">{editing ? '配置网关' : '添加网关'}</h2>
        <button type="button" className="gcp-modal-close" aria-label="关闭" onClick={onCancel}>
          ×
        </button>
      </div>
      <label>
        名称 <input data-testid="add-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label>
        水印名称{' '}
        <input
          data-testid="add-watermark"
          value={watermark}
          onChange={(e) => setWatermark(e.target.value)}
          placeholder={name || '例如 DSH'}
        />
      </label>
      <label>
        启动命令{' '}
        <input data-testid="add-start" value={startCommand} onChange={(e) => setStartCommand(e.target.value)} required />
      </label>
      <label>
        端口（可选） <input data-testid="add-port" value={port} onChange={(e) => setPort(e.target.value)} />
      </label>
      <label>
        打开地址（可选）{' '}
        <input
          data-testid="add-open"
          value={openUrl}
          onChange={(e) => setOpenUrl(e.target.value)}
          placeholder="http://127.0.0.1:3080/"
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
        <button type="submit" data-testid="add-submit">
          保存
        </button>
      </div>
    </form>
    </div>,
    document.body,
  );
}

function createGatewayId(): string {
  const suffix = globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Math.random().toString(36).slice(2, 10);
  return `gw-${suffix}`;
}
