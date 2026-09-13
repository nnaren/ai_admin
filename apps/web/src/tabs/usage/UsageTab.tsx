import { useCallback, useEffect, useState } from 'react';
import { addUsageAccount, listUsage, updateUsageAccount } from '../../api/client.js';
import type { UsageAccount, UsageProvider } from '../../types.js';
import { UsageAccountForm } from './UsageAccountForm.js';
import { UsageCard } from './UsageCard.js';

export function UsageTab(): JSX.Element {
  const [providers, setProviders] = useState<UsageProvider[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<UsageProvider | null>(null);

  const refresh = useCallback(async () => {
    try {
      setProviders(await listUsage());
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoaded(true);
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
      <div style={{ marginBottom: 16 }}>
        <button
          data-testid="add-account"
          onClick={() => {
            setEditing(null);
            setShowAdd(true);
          }}
        >
          添加模型账号
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
