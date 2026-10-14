import { claudeCodeAdapter } from './claudeCode.js';
import { codexAdapter } from './codex.js';
import { createDeepSeekAdapter } from './deepseek.js';
import type { PluginAdapter, PluginScopeTarget } from './types.js';

/** The three tools the tab manages, in display order. */
export const ADAPTERS: readonly PluginAdapter[] = [
  claudeCodeAdapter,
  codexAdapter,
  createDeepSeekAdapter(),
];

/** User scope always resolves against the home directory. */
export function userTarget(home: string): PluginScopeTarget {
  return { scope: 'user', root: home, home };
}

/** Project scope resolves against the registered project path. */
export function projectTarget(projectPath: string, home: string, projectId?: string): PluginScopeTarget {
  return { scope: 'project', root: projectPath, home, projectId };
}
