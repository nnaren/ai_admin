/**
 * Generic tab host. INTENTIONALLY BLANK about business semantics.
 *
 * INVARIANT: This file MUST NOT import the gateways schema or any specific
 * business/API shape. The only thing it reads is the TabDef interface
 * (id, path, label, component) from registry.ts.
 *
 * This invariant is enforced by:
 *  - apps/web/test/unit/tabhost.import-boundary.test.ts (string-grep)
 *  - apps/web/test/unit/registry.extension.test.ts (functionally)
 *
 * Adding a new tab MUST require zero changes to this file.
 */

import { useState } from 'react';
import { getTabs, type TabDef } from './registry.js';

export function TabHost(): JSX.Element {
  const all = getTabs();
  const [activeId, setActiveId] = useState<string | undefined>(all[0]?.id);
  const active: TabDef | undefined = all.find((t) => t.id === activeId);

  return (
    <div data-testid="tab-host">
      <nav className="gcp-tabs" aria-label="Tabs">
        {all.map((t) => (
          <button
            key={t.id}
            className={t.id === activeId ? 'active' : ''}
            onClick={() => setActiveId(t.id)}
            data-testid={`tab-${t.id}`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <main className="gcp-tab-content">
        {active ? <active.component /> : <p>No tab registered.</p>}
      </main>
    </div>
  );
}
