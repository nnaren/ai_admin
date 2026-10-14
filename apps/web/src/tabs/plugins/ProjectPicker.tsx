/**
 * Add-a-project form with a directory picker.
 *
 * Typing a path is always available; 「浏览…」 opens an in-panel folder browser
 * backed by `GET /api/plugins/browse`, which lists real subdirectories of this
 * machine. Nothing here guesses: the chosen path is sent to the server, which
 * verifies the directory exists before registering it.
 */

import { useCallback, useEffect, useState } from 'react';
import { browseDirectories } from '../../api/client.js';
import type { BrowseResult } from '../../types.js';

export interface ProjectPickerProps {
  busy: boolean;
  onSubmit: (path: string) => Promise<void>;
  onCancel: () => void;
}

export function ProjectPicker({ busy, onSubmit, onCancel }: ProjectPickerProps): JSX.Element {
  const [path, setPath] = useState('');
  const [browsing, setBrowsing] = useState(false);
  const [listing, setListing] = useState<BrowseResult | null>(null);

  const load = useCallback(async (target?: string) => {
    try {
      // A failed listing still renders: `error` is shown in place of the
      // directory list, so "permission denied" never reads as "empty folder".
      setListing(await browseDirectories(target));
    } catch (err) {
      setListing({
        path: target ?? '',
        parent: null,
        home: false,
        dirs: [],
        error: (err as Error).message,
      });
    }
  }, []);

  useEffect(() => {
    if (browsing) void load();
  }, [browsing, load]);

  /** A directory clicked in the list becomes the chosen path, and we descend. */
  const choose = useCallback(
    async (target: string) => {
      setPath(target);
      if (browsing) await load(target);
    },
    [browsing, load],
  );

  const submit = async () => {
    const value = path.trim();
    if (!value) return;
    await onSubmit(value);
  };

  return (
    <section className="gcp-plugin-col-add is-form" data-testid="project-col-new">
      <h3 className="gcp-plugin-col-add-title">添加项目</h3>
      <p className="gcp-plugin-hint">输入项目目录，或用「浏览…」在本机中选择。添加后自动扫描。</p>

      <div className="gcp-path-picker">
        <input
          className="gcp-plugin-search"
          data-testid="project-path-input"
          aria-label="项目目录"
          placeholder="/Users/you/code/my-project"
          autoFocus
          value={path}
          onChange={(e) => setPath(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit();
          }}
        />
        <button
          type="button"
          data-testid="project-browse"
          disabled={busy}
          title="在本机中浏览目录"
          onClick={() => setBrowsing((v) => !v)}
        >
          浏览…
        </button>
      </div>

      {browsing && (
        <div className="gcp-dir-browser" data-testid="dir-browser">
          <div className="gcp-dir-current" data-testid="dir-current">
            {listing?.error ? <span className="gcp-dir-error">{listing.error}</span> : listing?.path}
            {listing?.truncated && <span className="gcp-meta"> （条目过多，仅显示前 500 项）</span>}
          </div>

          <div className="gcp-dir-actions">
            {listing?.parent && (
              <button
                type="button"
                data-testid="dir-up"
                onClick={() => void choose(listing.parent!)}
              >
                上一级
              </button>
            )}
            <button
              type="button"
              className="primary"
              data-testid="dir-pick"
              disabled={busy || !listing?.path || Boolean(listing.error)}
              title="使用当前目录作为项目"
              onClick={() => {
                if (listing?.path) {
                  setPath(listing.path);
                  setBrowsing(false);
                }
              }}
            >
              选择此目录
            </button>
          </div>

          <ul className="gcp-dir-list">
            {(listing?.dirs ?? []).map((dir) => (
              <li key={dir.path}>
                <button
                  type="button"
                  className="gcp-dir-item"
                  data-testid={`dir-${dir.name}`}
                  title={dir.path}
                  onClick={() => void choose(dir.path)}
                >
                  <span className="gcp-dir-icon" aria-hidden="true">
                    ▸
                  </span>
                  {dir.name}
                </button>
              </li>
            ))}
            {listing && listing.dirs.length === 0 && !listing.error && (
              <li className="gcp-plugin-hint">此目录下没有子目录。</li>
            )}
          </ul>
        </div>
      )}

      <div className="gcp-plugin-col-add-actions">
        <button
          type="button"
          className="primary"
          data-testid="project-add-submit"
          disabled={busy || !path.trim()}
          onClick={() => void submit()}
        >
          添加并扫描
        </button>
        <button type="button" onClick={onCancel}>
          取消
        </button>
      </div>
    </section>
  );
}
