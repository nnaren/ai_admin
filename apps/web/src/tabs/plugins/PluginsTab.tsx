import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addPluginProject,
  installPlugin,
  listPlugins,
  removePluginProject,
  setPluginEnabled,
  uninstallPlugin,
} from '../../api/client.js';
import type {
  CatalogPlugin,
  PluginEntry,
  PluginOverview,
  PluginScopeView,
  PluginToolId,
} from '../../types.js';
import { formatHealthAge } from '../gateways/healthAge.js';
import { PluginScopeColumn } from './PluginScopeColumn.js';
import { ProjectPicker } from './ProjectPicker.js';
import { ToolRail } from './ToolRail.js';

/** Column key for the resident user scope; projects use their registry id. */
const USER_COLUMN = 'user';

/**
 * Plugins tab.
 *
 * Layout, left to right:
 *   1. the three tools
 *   2. 用户级 — the resident user scope for the selected tool
 *   3. …   one column per registered project, same tool
 *
 * Everything is on screen at once, so a project's plugins can be compared with
 * the user scope without switching views. Adding a project appends a column;
 * removing one takes its column away and forgets the path, deleting nothing.
 *
 * Every mutation is followed by a refetch rather than a local guess — these
 * writes land in the tools' own config files, and what the tool stored is truth.
 */
export function PluginsTab(): JSX.Element {
  const [overview, setOverview] = useState<PluginOverview | null>(null);
  const [tool, setTool] = useState<PluginToolId>('claudecode');
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const refresh = useCallback(async (opts?: { showBusy?: boolean }) => {
    if (opts?.showBusy) setRefreshing(true);
    try {
      const next = await listPlugins();
      setOverview(next);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoaded(true);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const now = useTicker(5_000);

  const selected = useMemo(
    () => overview?.tools.find((t) => t.id === tool) ?? overview?.tools[0],
    [overview, tool],
  );
  const toolId = selected?.id ?? tool;

  /** Run one mutation, showing its key as busy, then refetch the truth. */
  const run = useCallback(
    async (key: string, action: () => Promise<unknown>) => {
      setBusyKey(key);
      setError(null);
      try {
        await action();
        await refresh();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusyKey(null);
      }
    },
    [refresh],
  );

  /** The user column is scope `user`; every project column passes its registry id. */
  const scopeArgs = useCallback(
    (columnId: string) =>
      columnId === USER_COLUMN
        ? { scope: 'user' as const, projectId: undefined }
        : { scope: 'project' as const, projectId: columnId },
    [],
  );

  const handleToggle = useCallback(
    (columnId: string, plugin: PluginEntry, enabled: boolean) => {
      const { scope, projectId } = scopeArgs(columnId);
      return void run(`${columnId}:${plugin.id}`, () =>
        setPluginEnabled(toolId, scope, plugin.id, enabled, projectId),
      );
    },
    [run, scopeArgs, toolId],
  );

  const handleInstall = useCallback(
    (columnId: string, offer: CatalogPlugin) => {
      const { scope, projectId } = scopeArgs(columnId);
      return void run(`${columnId}:${offer.id}`, () =>
        installPlugin(toolId, scope, offer.marketplace, offer.name, projectId),
      );
    },
    [run, scopeArgs, toolId],
  );

  const handleUninstall = useCallback(
    (columnId: string, plugin: PluginEntry) => {
      const { scope, projectId } = scopeArgs(columnId);
      return void run(`${columnId}:${plugin.id}`, () =>
        uninstallPlugin(toolId, scope, plugin.id, projectId),
      );
    },
    [run, scopeArgs, toolId],
  );

  const addProject = useCallback(
    async (path: string) => {
      await run('project', async () => {
        await addPluginProject(path);
        setAdding(false);
      });
    },
    [run],
  );

  const handleRemoveProject = useCallback(
    (id: string) => void run('project', () => removePluginProject(id)),
    [run],
  );

  const userScopes = useMemo(() => {
    const map: Partial<Record<PluginToolId, PluginScopeView>> = {};
    for (const t of overview?.tools ?? []) map[t.id] = t.userScope;
    return map;
  }, [overview]);

  return (
    <div className="gcp-plugins-tab" data-testid="plugins-tab">
      {error && (
        <div
          className="gcp-card"
          style={{ borderColor: 'var(--err)', marginBottom: 16 }}
          data-testid="plugin-error-banner"
        >
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="gcp-plugins-toolbar">
        <strong className="gcp-plugins-toolbar-title">插件管理</strong>
        <span className="gcp-usage-refreshed" data-testid="plugins-refreshed">
          {overview ? `${formatHealthAge(overview.refreshedAt, now)}更新` : '未刷新'}
        </span>
        <button
          type="button"
          className={`gcp-icon-btn${refreshing ? ' is-refreshing' : ''}`}
          data-testid="refresh-plugins"
          aria-label="刷新"
          title="刷新"
          aria-busy={refreshing}
          disabled={refreshing}
          onClick={() => void refresh({ showBusy: true })}
        >
          <RefreshIcon />
        </button>
      </div>

      <div className="gcp-plugins-layout" data-testid="plugins-layout">
        <ToolRail
          tools={overview?.tools ?? []}
          userScopes={userScopes}
          selected={toolId}
          onSelect={setTool}
        />

        {selected && (
          <PluginScopeColumn
            columnId={USER_COLUMN}
            toolId={selected.id}
            toolLabel={selected.label}
            color={selected.color}
            view={selected.userScope}
            busyKey={busyKey}
            onToggle={(plugin, enabled) => handleToggle(USER_COLUMN, plugin, enabled)}
            onInstall={(offer) => handleInstall(USER_COLUMN, offer)}
            onUninstall={(plugin) => handleUninstall(USER_COLUMN, plugin)}
          />
        )}

        {(overview?.projects ?? []).map((project) => (
          <PluginScopeColumn
            key={project.id}
            columnId={project.id}
            projectName={project.name}
            toolId={toolId}
            toolLabel={selected?.label ?? tool}
            color={selected?.color ?? 'blue'}
            view={project.scopes[toolId] ?? emptyScope(project.path)}
            busyKey={busyKey}
            onToggle={(plugin, enabled) => handleToggle(project.id, plugin, enabled)}
            onInstall={(offer) => handleInstall(project.id, offer)}
            onUninstall={(plugin) => handleUninstall(project.id, plugin)}
            onRemoveProject={() => handleRemoveProject(project.id)}
          />
        ))}

        {adding ? (
          <ProjectPicker
            busy={busyKey === 'project'}
            onSubmit={addProject}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button
            type="button"
            className="gcp-plugin-col-add"
            data-testid="project-add"
            onClick={() => setAdding(true)}
          >
            + 添加项目
          </button>
        )}
      </div>

      {loaded && !overview && !error && <p style={{ color: 'var(--muted)' }}>加载中…</p>}
    </div>
  );
}

/** Placeholder for a project that has no directory for the selected tool yet. */
function emptyScope(root: string): PluginScopeView {
  return {
    scope: 'project',
    root,
    present: false,
    plugins: [],
    marketplaces: [],
    catalog: [],
    canInstall: false,
  };
}

/** Ticking clock so relative timestamps ("刚刚" → "3分钟前") stay honest. */
function useTicker(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
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
