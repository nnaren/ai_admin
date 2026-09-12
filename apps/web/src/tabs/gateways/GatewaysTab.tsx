import { useEffect, useState, useCallback } from 'react';
import {
  listGateways,
  startGateway,
  stopGateway,
  addGateway,
  deleteGateway,
} from '../../api/client.js';
import type { GatewayStatus, Gateway } from '../../types.js';
import { GatewayCard } from './GatewayCard.js';

const POLL_MS = 3000;

export function GatewaysTab(): JSX.Element {
  const [statuses, setStatuses] = useState<GatewayStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await listGateways();
      setStatuses(next);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const handleStart = useCallback(
    async (id: string) => {
      setBusyId(id);
      try {
        await startGateway(id);
        await refresh();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusyId(null);
      }
    },
    [refresh],
  );

  const handleStop = useCallback(
    async (id: string) => {
      setBusyId(id);
      try {
        await stopGateway(id);
        await refresh();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusyId(null);
      }
    },
    [refresh],
  );

  const handleAdd = useCallback(
    async (gw: Gateway) => {
      try {
        await addGateway(gw);
        setShowAdd(false);
        await refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [refresh],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteGateway(id);
        await refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [refresh],
  );

  return (
    <div data-testid="gateways-tab">
      {error && (
        <div className="gcp-card" style={{ borderColor: 'var(--err)', marginBottom: 16 }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <button data-testid="add-gateway" onClick={() => setShowAdd((s) => !s)}>
          {showAdd ? 'Cancel' : 'Add gateway'}
        </button>
      </div>

      {showAdd && <AddGatewayForm onSubmit={handleAdd} />}

      {statuses.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>No gateways configured. Add one or edit config/gateways.yaml.</p>
      ) : (
        <div className="gcp-card-grid">
          {statuses.map((s) => (
            <GatewayCard
              key={s.gateway.id}
              status={s}
              onStart={handleStart}
              onStop={handleStop}
              busy={busyId === s.gateway.id}
            />
          ))}
        </div>
      )}

      {/* Hidden delete button used by e2e tests for cleanup; rendered once */}
      {statuses.length > 0 && (
        <button
          data-testid="delete-toolbar"
          onClick={() => void handleDelete(statuses[0]!.gateway.id)}
          style={{ display: 'none' }}
        >
          delete first
        </button>
      )}
    </div>
  );
}

function AddGatewayForm({ onSubmit }: { onSubmit: (gw: Gateway) => Promise<void> }): JSX.Element {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [startCommand, setStartCommand] = useState('');
  const [port, setPort] = useState('');

  return (
    <form
      data-testid="add-form"
      className="gcp-card"
      style={{ marginBottom: 16, display: 'grid', gap: 8 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!id || !name || !startCommand) return;
        void onSubmit({
          id,
          name,
          startCommand,
          port: port ? Number(port) : undefined,
        });
      }}
    >
      <label>id <input data-testid="add-id" value={id} onChange={(e) => setId(e.target.value)} required /></label>
      <label>name <input data-testid="add-name" value={name} onChange={(e) => setName(e.target.value)} required /></label>
      <label>start command <input data-testid="add-start" value={startCommand} onChange={(e) => setStartCommand(e.target.value)} required /></label>
      <label>port (optional) <input data-testid="add-port" value={port} onChange={(e) => setPort(e.target.value)} /></label>
      <button type="submit" data-testid="add-submit">Save</button>
    </form>
  );
}
