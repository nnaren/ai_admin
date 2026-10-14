/**
 * Builds the plugins tab payload.
 *
 * Every scan is independent and failure-tolerant: one tool with a broken config
 * reports `lastError` on its own card instead of blanking the whole tab. Scans
 * are read-only — nothing here writes to a tool's directories.
 */

import type {
  PluginOverview,
  PluginProject,
  PluginProjectView,
  PluginScopeView,
  PluginToolView,
} from '../types.js';
import type { PluginStore } from './pluginStore.js';
import { ADAPTERS, projectTarget, userTarget } from './plugins/index.js';
import type { PluginAdapter, PluginScopeTarget } from './plugins/types.js';

export class PluginScanner {
  constructor(
    private readonly store: PluginStore,
    /** Home directory the resident user scope is scanned from. */
    readonly home: string,
    private readonly adapters: readonly PluginAdapter[] = ADAPTERS,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async overview(): Promise<PluginOverview> {
    const tools: PluginToolView[] = await Promise.all(
      this.adapters.map(async (adapter) => ({
        id: adapter.id,
        label: adapter.label,
        color: adapter.color,
        userScope: await this.scanScope(adapter, userTarget(this.home)),
      })),
    );
    const projects = await Promise.all(this.store.list().map((p) => this.projectView(p)));

    return {
      refreshedAt: this.now().toISOString(),
      home: this.home,
      tools,
      projects,
    };
  }

  async projectView(project: PluginProject): Promise<PluginProjectView> {
    const scopes: PluginProjectView['scopes'] = {};
    await Promise.all(
      this.adapters.map(async (adapter) => {
        scopes[adapter.id] = await this.scanScope(
          adapter,
          projectTarget(project.path, this.home, project.id),
        );
      }),
    );
    return { ...project, scopes };
  }

  /** Resolve the target a mutation applies to, or throw a client-facing error. */
  async target(
    toolId: string,
    scope: 'user' | 'project',
    projectId?: string,
  ): Promise<{ adapter: PluginAdapter; target: PluginScopeTarget }> {
    const adapter = this.adapters.find((a) => a.id === toolId);
    if (!adapter) throw new Error(`unknown plugin tool "${toolId}"`);
    if (scope === 'user') return { adapter, target: userTarget(this.home) };
    if (!projectId) throw new Error('project scope requires a project id');
    const project = this.store.get(projectId);
    if (!project) throw new Error(`unknown project "${projectId}"`);
    return { adapter, target: projectTarget(project.path, this.home, project.id) };
  }

  private async scanScope(
    adapter: PluginAdapter,
    target: PluginScopeTarget,
  ): Promise<PluginScopeView> {
    const base = { scope: target.scope, root: target.root };
    try {
      return { ...base, ...(await adapter.scan(target)) };
    } catch (err) {
      // A tool that cannot be read still gets a card, saying why.
      return {
        ...base,
        present: false,
        plugins: [],
        marketplaces: [],
        catalog: [],
        canInstall: adapter.canInstall,
        note: adapter.note,
        lastError: (err as Error).message,
      };
    }
  }
}
