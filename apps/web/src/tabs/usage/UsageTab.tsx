import { useCallback, useEffect, useRef, useState } from 'react';
import { addUsageAccount, listUsage, updateUsageAccount } from '../../api/client.js';
import type { UsageAccount, UsageProvider } from '../../types.js';
import { UsageAccountForm } from './UsageAccountForm.js';
import { UsageCard } from './UsageCard.js';

export function UsageTab(): JSX.Element {
  const [providers, setProviders] = useState<UsageProvider[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<UsageProvider | null>(null);
  const refreshSeq = useRef(0);

  const refresh = useCallback(async (opts?: { showBusy?: boolean }) => {
    const seq = ++refreshSeq.current;
    if (opts?.showBusy) setRefreshing(true);
    try {
      const next = await listUsage();
      if (seq !== refreshSeq.current) return;
      setProviders(next);
      setError(null);
    } catch (err) {
      if (seq !== refreshSeq.current) return;
      setError((err as Error).message);
    } finally {
      if (seq === refreshSeq.current) {
        setLoaded(true);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleAdd = useCallback(
    async (account: UsageAccount) => {
      try {
        await addUsageAccount(account);
        setShowAdd(false);
        await refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [refresh],
  );

  const handleUpdate = useCallback(
    async (account: UsageAccount) => {
      try {
        await updateUsageAccount(account.id, account);
        setEditing(null);
        await refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [refresh],
  );

  return (
    <div className="gcp-usage-tab" data-testid="usage-tab">
      {error && (
        <div className="gcp-card" style={{ borderColor: 'var(--err)', marginBottom: 16 }}>
          <strong>Error:</strong> {error}
        </div>
      )}
      <div className="gcp-usage-toolbar">
        <button
          data-testid="add-account"
          onClick={() => {
            setEditing(null);
            setShowAdd(true);
          }}
        >
          添加模型账号
        </button>
        <button
          type="button"
          className={`gcp-icon-btn${refreshing ? ' is-refreshing' : ''}`}
          data-testid="refresh-usage"
          aria-label="刷新"
          title="刷新"
          aria-busy={refreshing}
          disabled={refreshing}
          onClick={() => void refresh({ showBusy: true })}
        >
          <RefreshIcon />
        </button>
      </div>

      {showAdd && <UsageAccountForm onSubmit={handleAdd} onCancel={() => setShowAdd(false)} />}
      {editing && (
        <UsageAccountForm
          key={editing.id}
          initial={editing}
          onSubmit={handleUpdate}
          onCancel={() => setEditing(null)}
        />
      )}

      {loaded && providers.length === 0 && !error ? (
        <p style={{ color: 'var(--muted)' }}>还没有模型账号。请点击「添加模型账号」按钮添加。</p>
      ) : (
        <div className="gcp-card-grid">
          {providers.map((provider) => (
            <UsageCard
              key={provider.id}
              provider={provider}
              onConfigure={(next) => {
                setShowAdd(false);
                setEditing((current) => (current?.id === next.id ? null : next));
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RefreshIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"
      />
      <path
        fill="currentColor"
        d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"
      />
    </svg>
  );
}
