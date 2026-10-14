/**
 * One column of the plugins layout: a single tool, under a single scope.
 *
 * Column 2 is always the resident user scope; every column after it is one
 * registered project. A project can therefore be read against the user scope in
 * one glance — which is the whole point of the layout — and each column owns
 * its own plugin list, marketplace and actions.
 */

import { useState } from 'react';
import { resolveGatewayColor } from '../gateways/colors.js';
import { InstallPluginDialog } from './InstallPluginDialog.js';
import type { CatalogPlugin, PluginEntry, PluginScopeView, PluginToolId } from '../../types.js';

export interface PluginScopeColumnProps {
  /** Stable per-column key: `user` for the resident column, else the project id. */
  columnId: string;
  /** Project display name; omitted for the user column. */
  projectName?: string;
  toolId: PluginToolId;
  toolLabel: string;
  color: string;
  view: PluginScopeView;
  busyKey?: string | null;
  onToggle: (plugin: PluginEntry, enabled: boolean) => void;
  onInstall: (offer: CatalogPlugin) => void;
  onUninstall: (plugin: PluginEntry) => void;
  onRemoveProject?: () => void;
}

export function PluginScopeColumn({
  columnId,
  projectName,
  toolId,
  toolLabel,
  color,
  view,
  busyKey,
  onToggle,
  onInstall,
  onUninstall,
  onRemoveProject,
}: PluginScopeColumnProps): JSX.Element {
  const [installOpen, setInstallOpen] = useState(false);
  const enabledCount = view.plugins.filter((p) => p.enabled).length;

  return (
    <section
      className={`gcp-plugin-col gcp-card-${resolveGatewayColor(color)}`}
      data-testid={`plugin-col-${columnId}-${toolId}`}
      data-column={columnId}
    >
      {/* 总揽框: what this column is, and its counts. Not a wrapper — the
          plugin cards below stand on their own. */}
      <header className="gcp-plugin-col-summary">
        <div className="gcp-plugin-col-title">
          <span className="gcp-plugin-col-scope" data-testid={`plugin-scope-${columnId}`}>
            {view.scope === 'user' ? '用户级 · 常驻' : '项目级'}
          </span>
          {projectName && (
            <span className="gcp-plugin-col-name" title={projectName}>
              {projectName}
            </span>
          )}
        </div>

        <div className="gcp-plugin-col-tools">
          <span className="gcp-plugin-col-tool" title={toolLabel}>
            {toolLabel}
          </span>
          <button
            type="button"
            className="gcp-market-open"
            data-testid={`install-open-${columnId}`}
            disabled={view.catalog.length === 0 || busyKey !== null}
            title={
              view.catalog.length === 0
                ? '没有发现可用的插件市场'
                : `从 ${view.marketplaces.length} 个市场安装插件`
            }
            onClick={() => setInstallOpen(true)}
          >
            安装 · {view.catalog.length}
          </button>
          {onRemoveProject && (
            <button
              type="button"
              className="gcp-col-remove"
              data-testid={`project-remove-${columnId}`}
              title="从面板中移除该项目（不会删除任何文件）"
              aria-label={`移除项目 ${projectName}`}
              disabled={busyKey !== null}
              onClick={onRemoveProject}
            >
              ×
            </button>
          )}
        </div>

        <div className="gcp-plugin-col-root" data-testid={`plugin-root-${columnId}-${toolId}`}>
          {view.root}
        </div>

        <div className="gcp-plugin-col-stats" data-testid={`plugin-count-${columnId}`}>
          {view.plugins.length === 0
            ? view.present
              ? '暂无插件'
              : '该目录下没有此工具的配置'
            : `${enabledCount}/${view.plugins.length} 已激活`}
        </div>

        {view.lastError && (
          <p className="gcp-plugin-col-error" data-testid={`plugin-error-${columnId}`}>
            读取失败：{view.lastError}
          </p>
        )}
      </header>

      <div className="gcp-plugin-col-body">
        {view.plugins.length === 0 ? (
          <p className="gcp-plugin-hint" data-testid={`plugin-empty-${columnId}`}>
            {view.present ? '还没有插件，可从市场安装。' : '该目录下没有此工具的配置'}
          </p>
        ) : (
          <ul className="gcp-plugin-list">
            {view.plugins.map((plugin) => (
              <li className="gcp-plugin-row" key={plugin.id} data-testid={`plugin-${columnId}-${plugin.name}`}>
                <div className="gcp-plugin-main">
                  <span className="gcp-plugin-name">{plugin.name}</span>
                  <span className="gcp-plugin-meta">
                    {plugin.marketplace}
                    {plugin.version ? ` · v${plugin.version}` : ''}
                  </span>
                </div>
                <div className="gcp-plugin-actions">
                  <label className="gcp-switch">
                    <input
                      type="checkbox"
                      data-testid={`toggle-${columnId}-${plugin.name}`}
                      aria-label={`${plugin.name} ${plugin.enabled ? '已激活' : '未激活'}`}
                      checked={plugin.enabled}
                      disabled={busyKey !== null}
                      onChange={(e) => onToggle(plugin, e.target.checked)}
                    />
                    <span className="gcp-switch-state">{plugin.enabled ? '已激活' : '已停用'}</span>
                  </label>
                  <button
                    type="button"
                    className="danger"
                    data-testid={`uninstall-${columnId}-${plugin.name}`}
                    disabled={busyKey !== null}
                    title={view.scope === 'user' ? '卸载插件' : '从本项目移除'}
                    onClick={() => onUninstall(plugin)}
                  >
                    {view.scope === 'user' ? '卸载' : '移除'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {view.note && <p className="gcp-plugin-note">{view.note}</p>}
      </div>

      {installOpen && (
        <InstallPluginDialog
          toolId={toolId}
          toolLabel={toolLabel}
          view={view}
          busyKey={busyKey}
          onInstall={onInstall}
          onClose={() => setInstallOpen(false)}
        />
      )}
    </section>
  );
}
