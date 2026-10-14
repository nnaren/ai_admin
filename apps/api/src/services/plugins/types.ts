import type {
  PluginScopeView,
  PluginToolId,
} from '../../types.js';

/** Where a write/read for one tool+scope is aimed. */
export interface PluginScopeTarget {
  scope: 'user' | 'project';
  /** Project directory for project scope; the home directory for user scope. */
  root: string;
  /**
   * Always the OS home directory, including for project scope: Claude Code and
   * Codex keep their *global* registries (installed plugins, marketplaces) in the
   * user's home and tag each entry with its scope, while enablement is per-scope.
   */
  home: string;
  /** Registered project id, project scope only. */
  projectId?: string;
}

export interface InstallRequest {
  /** Marketplace id (`omc`, `openai-bundled`, …). */
  marketplace: string;
  /** Plugin name inside that marketplace. */
  plugin: string;
}

export interface PluginAdapter {
  id: PluginToolId;
  label: string;
  color: string;
  /** Whether the panel drives this tool's install path. */
  canInstall: boolean;
  /** Caveat shown in the UI when the panel cannot do something. */
  note?: string;
  /** Directory this tool keeps under any root (`<root>/.claude`). */
  toolHome(root: string): string;
  /** Read-only inventory. Must tolerate a missing root (return empty + present:false). */
  scan(target: PluginScopeTarget): Promise<Omit<PluginScopeView, 'scope' | 'root'>>;
  /** Activate or deactivate one installed plugin (the panel's 激活 action). */
  setEnabled(target: PluginScopeTarget, pluginId: string, enabled: boolean): Promise<void>;
  /** Install one marketplace plugin (the panel's 从市场安装 action). */
  install(target: PluginScopeTarget, req: InstallRequest): Promise<void>;
  /** Remove one installed plugin's registration. */
  uninstall(target: PluginScopeTarget, pluginId: string): Promise<void>;
}

/** `name@marketplace` — the key Claude Code, Codex and this panel all agree on. */
export function pluginId(name: string, marketplace: string): string {
  return `${name}@${marketplace}`;
}

export function splitPluginId(id: string): { name: string; marketplace: string } {
  const at = id.lastIndexOf('@');
  if (at <= 0) throw new Error(`plugin id must be "name@marketplace", got "${id}"`);
  return { name: id.slice(0, at), marketplace: id.slice(at + 1) };
}
