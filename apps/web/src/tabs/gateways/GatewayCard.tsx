import type { GatewayStatus } from '../../types.js';

interface GatewayCardProps {
  status: GatewayStatus;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  busy: boolean;
}

export function GatewayCard({ status, onStart, onStop, busy }: GatewayCardProps): JSX.Element {
  const { gateway, running, pid, health, lastError } = status;

  const stateBadge = running
    ? { label: 'running', cls: 'ok' }
    : { label: 'stopped', cls: 'warn' };

  return (
    <article className="gcp-card" data-testid={`card-${gateway.id}`}>
      <div className="title">
        <span>{gateway.name}</span>
        <span className={`badge ${stateBadge.cls}`} data-testid={`state-${gateway.id}`}>
          {stateBadge.label}
        </span>
      </div>
      <div className="field">
        <span>id</span>
        <span className="value">{gateway.id}</span>
      </div>
      <div className="field">
        <span>pid</span>
        <span className="value">{pid ?? '—'}</span>
      </div>
      {gateway.port !== undefined && (
        <div className="field">
          <span>port</span>
          <span className="value">{gateway.port}</span>
        </div>
      )}
      {gateway.healthUrl && (
        <div className="field">
          <span>health url</span>
          <span className="value">{gateway.healthUrl}</span>
        </div>
      )}
      {health && (
        <div className="field">
          <span>last health</span>
          <span className="value">
            {health.ok ? `ok (${health.httpCode})` : `fail (${health.error ?? 'unknown'})`}
            {' @ '}
            {new Date(health.at).toLocaleTimeString()}
          </span>
        </div>
      )}
      {lastError && (
        <div className="field">
          <span>last error</span>
          <span className="value">{lastError}</span>
        </div>
      )}
      <div className="actions">
        <button
          data-testid={`start-${gateway.id}`}
          disabled={running || busy}
          onClick={() => onStart(gateway.id)}
        >
          Start
        </button>
        <button
          data-testid={`stop-${gateway.id}`}
          className="danger"
          disabled={!running || busy}
          onClick={() => onStop(gateway.id)}
        >
          Stop
        </button>
      </div>
    </article>
  );
}
