import { useEffect, useState, useCallback } from 'react';
import {
  listGateways,
  startGateway,
  stopGateway,
  addGateway,
  updateGateway,
  deleteGateway,
} from '../../api/client.js';
import type { GatewayStatus, Gateway } from '../../types.js';
import { GatewayCard } from './GatewayCard.js';
import { GatewayForm } from './GatewayForm.js';

const POLL_MS = 3000;

export function GatewaysTab(): JSX.Element {
  const [statuses, setStatuses] = useState<GatewayStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Gateway | null>(null);

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

  const handleUpdate = useCallback(
    async (gw: Gateway) => {
      try {
        await updateGateway(gw.id, gw);
        setEditing(null);
        await refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [refresh],
  );

  const handleConfigure = useCallback((gateway: Gateway) => {
    setShowAdd(false);
    setEditing((current) => (current?.id === gateway.id ? null : gateway));
  }, []);

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
        <button
          data-testid="add-gateway"
          onClick={() => {
            setEditing(null);
            setShowAdd(true);
          }}
        >
          Add gateway
        </button>
      </div>

      {showAdd && <GatewayForm onSubmit={handleAdd} onCancel={() => setShowAdd(false)} />}
      {editing && (
        <GatewayForm
          key={editing.id}
          initial={editing}
          onSubmit={handleUpdate}
          onCancel={() => setEditing(null)}
        />
      )}

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
              onConfigure={handleConfigure}
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
