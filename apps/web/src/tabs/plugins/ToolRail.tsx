/**
 * Column 1: which tool the rest of the layout is about.
 *
 * Selecting a tool switches every scope column at once, so the user scope and
 * each project column are always comparing the same tool.
 */

import { resolveGatewayColor } from '../gateways/colors.js';
import type { PluginScopeView, PluginToolId } from '../../types.js';

export interface ToolRailProps {
  tools: { id: PluginToolId; label: string; color: string }[];
  /** Per-tool user scope, for the counts on each entry. */
  userScopes: Partial<Record<PluginToolId, PluginScopeView>>;
  selected: PluginToolId;
  onSelect: (id: PluginToolId) => void;
}

export function ToolRail({ tools, userScopes, selected, onSelect }: ToolRailProps): JSX.Element {
  return (
    <nav className="gcp-tool-rail" aria-label="工具" data-testid="tool-rail">
      <h3 className="gcp-tool-rail-head">工具</h3>
      {tools.map((tool) => {
        const scope = userScopes[tool.id];
        const count = scope?.plugins.length ?? 0;
        const broken = Boolean(scope?.lastError);
        return (
          <button
            key={tool.id}
            type="button"
            className={`gcp-tool-item gcp-card-${resolveGatewayColor(tool.color)}${
              tool.id === selected ? ' active' : ''
            }`}
            data-testid={`tool-${tool.id}`}
            aria-current={tool.id === selected}
            onClick={() => onSelect(tool.id)}
          >
            <span className="gcp-tool-name">{tool.label}</span>
            <span className="gcp-tool-meta">
              {broken ? '读取失败' : `${count} 个插件`}
              {scope?.catalog.length ? ` · ${scope.catalog.length} 市场项` : ''}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
