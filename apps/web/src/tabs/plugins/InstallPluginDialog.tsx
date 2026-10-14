/**
 * Install dialog: pick a marketplace, then pick a plugin from it.
 *
 * Opened from a scope column (user or project). The marketplace list and the
 * catalog come from the column's own scan, so what can be installed is exactly
 * what the panel found on disk — and an offer the panel cannot install locally
 * says so instead of failing on click.
 */

import { useMemo, useState } from 'react';
import type { CatalogPlugin, PluginScopeView, PluginToolId } from '../../types.js';

export interface InstallPluginDialogProps {
  toolId: PluginToolId;
  toolLabel: string;
  view: PluginScopeView;
  busyKey?: string | null;
  onInstall: (offer: CatalogPlugin) => void;
  onClose: () => void;
}

export function InstallPluginDialog({
  toolId,
  toolLabel,
  view,
  busyKey,
  onInstall,
  onClose,
}: InstallPluginDialogProps): JSX.Element {
  const marketplaceIds = useMemo(() => {
    const fromCatalog = [...new Set(view.catalog.map((c) => c.marketplace))].sort();
    const known = view.marketplaces.map((m) => m.id);
    return [...new Set([...known, ...fromCatalog])].filter((id) =>
      view.catalog.some((c) => c.marketplace === id),
    );
  }, [view.catalog, view.marketplaces]);

  const [market, setMarket] = useState(marketplaceIds[0] ?? '');
  const [query, setQuery] = useState('');

  const offers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return view.catalog.filter(
      (c) =>
        c.marketplace === market &&
        (!q ||
          c.name.toLowerCase().includes(q) ||
          c.description?.toLowerCase().includes(q) ||
          c.tags?.some((t) => t.toLowerCase().includes(q))),
    );
  }, [view.catalog, market, query]);

  const installed = new Set(view.plugins.map((p) => p.id));
  const marketMeta = view.marketplaces.find((m) => m.id === market);

  return (
    <div
      className="gcp-modal"
      data-testid="install-modal"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="gcp-modal-card is-wide" role="dialog" aria-modal="true" aria-labelledby="gcp-install-title">
        <div className="gcp-modal-head">
          <h2 id="gcp-install-title">安装插件 · {toolLabel}</h2>
          <button
            type="button"
            className="gcp-modal-close"
            data-testid="install-close"
            aria-label="关闭"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {view.scope === 'user' ? (
          <p className="gcp-install-hint">
            安装到 <strong>用户级</strong>，对所有项目生效。
          </p>
        ) : (
          <p className="gcp-install-hint">
            安装到 <strong>本项目</strong>：<code>{view.root}</code>
          </p>
        )}

        {!view.canInstall && view.note && <p className="gcp-plugin-note">{view.note}</p>}

        {marketplaceIds.length === 0 ? (
          <p className="gcp-plugin-hint" data-testid="install-no-market">
            没有发现可用的插件市场。该工具的市场由其自身管理，面板只读取已安装的市场。
          </p>
        ) : (
          <>
            <label className="gcp-install-field">
              市场
              <select
                data-testid="install-marketplace"
                value={market}
                onChange={(e) => setMarket(e.target.value)}
              >
                {marketplaceIds.map((id) => (
                  <option key={id} value={id}>
                    {id}（{view.catalog.filter((c) => c.marketplace === id).length}）
                  </option>
                ))}
              </select>
            </label>

            {marketMeta?.source && <p className="gcp-install-source">来源：{marketMeta.source}</p>}

            <input
              className="gcp-plugin-search"
              type="search"
              data-testid="install-search"
              placeholder="在该市场中搜索…"
              aria-label={`在 ${market} 市场中搜索插件`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />

            {offers.length === 0 ? (
              <p className="gcp-plugin-hint" data-testid="install-no-match">
                没有匹配的插件。
              </p>
            ) : (
              <ul className="gcp-install-list" data-testid="install-list">
                {offers.map((offer) => {
                  const isInstalled = installed.has(offer.id);
                  const busy = busyKey === offer.id;
                  const installable = view.canInstall && Boolean(offer.sourcePath);
                  return (
                    <li className="gcp-install-row" key={offer.id} data-testid={`install-row-${offer.name}`}>
                      <div className="gcp-install-main">
                        <span className="gcp-install-name">
                          {offer.name}
                          {offer.version ? <span className="gcp-install-version">v{offer.version}</span> : null}
                        </span>
                        {offer.description && (
                          <span className="gcp-install-desc" title={offer.description}>
                            {offer.description}
                          </span>
                        )}
                        <span className="gcp-install-meta">
                          {offer.author ? `${offer.author} · ` : ''}
                          {offer.source ?? offer.marketplace}
                        </span>
                      </div>
                      <button
                        type="button"
                        data-testid={`install-pick-${toolId}-${offer.name}`}
                        disabled={!installable || isInstalled || busyKey !== null}
                        title={
                          isInstalled
                            ? '已安装'
                            : !view.canInstall
                              ? view.note
                              : !offer.sourcePath
                                ? '该插件未在本地面板中缓存，需由工具自身安装'
                                : '安装'
                        }
                        onClick={() => onInstall(offer)}
                      >
                        {isInstalled ? '已安装' : busy ? '安装中…' : '安装'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        <div className="gcp-modal-actions">
          <button type="button" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
