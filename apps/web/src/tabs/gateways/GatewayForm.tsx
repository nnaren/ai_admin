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
  const [id, setId] = useState(initial?.id ?? '');
  const [name, setName] = useState(initial?.name ?? '');
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
        if (!id || !name || !startCommand) return;
        void onSubmit({
          ...initial,
          id,
          name,
          startCommand,
          port: port ? Number(port) : undefined,
          openUrl: openUrl || undefined,
          color,
        });
      }}
    >
      <div className="gcp-modal-head">
        <h2 id="gcp-modal-title">{editing ? 'Configure gateway' : 'Add gateway'}</h2>
        <button type="button" className="gcp-modal-close" aria-label="Close" onClick={onCancel}>
          ×
        </button>
      </div>
      <label>
        id{' '}
        <input
          data-testid="add-id"
          value={id}
          onChange={(e) => setId(e.target.value)}
          required
          disabled={editing}
        />
      </label>
      <label>
        name <input data-testid="add-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label>
        start command{' '}
        <input data-testid="add-start" value={startCommand} onChange={(e) => setStartCommand(e.target.value)} required />
      </label>
      <label>
        port (optional) <input data-testid="add-port" value={port} onChange={(e) => setPort(e.target.value)} />
      </label>
      <label>
        open url (optional){' '}
        <input
          data-testid="add-open"
          value={openUrl}
          onChange={(e) => setOpenUrl(e.target.value)}
          placeholder="http://127.0.0.1:3080/"
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
        <button type="submit" data-testid="add-submit">
          Save
        </button>
      </div>
    </form>
    </div>,
    document.body,
  );
}
