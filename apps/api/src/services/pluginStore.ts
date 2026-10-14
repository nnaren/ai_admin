/**
 * Project registry for the plugins tab — the only state the panel owns itself.
 *
 * Plugin inventories are scanned from the tools' own directories (see
 * `claudeCode.ts` / `codex.ts` / `deepseek.ts`); this file records just the list
 * of projects the operator has added, so the project-scope view survives a
 * restart. Same YAML-authoritative model as `gateways.yaml` / `usage.yaml`.
 *
 * Shape:
 *   projects:
 *     - id: ai-admin
 *       name: ai_admin
 *       path: /Users/yuanye/CODE/tests/ai_admin
 *       addedAt: 2026-10-14T12:00:00.000Z
 */

import path from 'node:path';
import { parse as parseYaml, stringify as serializeYaml } from 'yaml';
import { expandHome, PluginConfigError, readTextFile, writeTextFileSafe } from './plugins/fsUtils.js';
import type { PluginProject } from '../types.js';

interface PluginsFile {
  projects?: PluginProject[];
}

export class PluginStore {
  private projects: PluginProject[] = [];

  constructor(
    private readonly filePath: string,
    /** Root the home directory is resolved against; overridden in tests. */
    private readonly home: string,
  ) {}

  async load(): Promise<PluginProject[]> {
    const raw = await readTextFile(this.filePath);
    if (raw === undefined) {
      this.projects = [];
      return this.projects;
    }
    let parsed: PluginsFile;
    try {
      parsed = (parseYaml(raw) ?? {}) as PluginsFile;
    } catch (err) {
      throw new PluginConfigError(`${this.filePath} is not valid YAML: ${(err as Error).message}`);
    }
    this.projects = (parsed.projects ?? []).map((p) => normalize(p, this.home));
    return this.projects;
  }

  list(): PluginProject[] {
    return this.projects;
  }

  get(id: string): PluginProject | undefined {
    return this.projects.find((p) => p.id === id);
  }

  /**
   * Register a project by absolute (or `~`-prefixed) directory.
   * Duplicate paths are rejected rather than silently merging two ids.
   */
  async add(input: string, now: () => Date = () => new Date()): Promise<PluginProject> {
    const resolved = expandHome(input.trim(), this.home);
    if (this.projects.some((p) => p.path === resolved)) {
      throw new PluginConfigError(`项目已在列表中：${resolved}`);
    }
    const project: PluginProject = {
      id: toId(path.basename(resolved), this.projects),
      name: path.basename(resolved) || resolved,
      path: resolved,
      addedAt: now().toISOString(),
    };
    this.projects = [...this.projects, project];
    await this.write();
    return project;
  }

  async remove(id: string): Promise<void> {
    const next = this.projects.filter((p) => p.id !== id);
    if (next.length === this.projects.length) {
      throw new PluginConfigError(`未知项目 "${id}"`);
    }
    this.projects = next;
    await this.write();
  }

  private async write(): Promise<void> {
    await writeTextFileSafe(this.filePath, serializeYaml({ projects: this.projects }));
  }
}

function normalize(project: PluginProject, home: string): PluginProject {
  return {
    ...project,
    path: expandHome(project.path, home),
    name: project.name || path.basename(project.path) || project.path,
  };
}

/**
 * URL-safe, collision-free id. Ids land in a URL path segment, so they are kept
 * ASCII: a non-ASCII directory name falls back to `project`, `project-2`, …
 * rather than carrying raw CJK through the API.
 */
function toId(base: string, existing: PluginProject[]): string {
  const slug =
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'project';
  if (!existing.some((p) => p.id === slug)) return slug;
  let n = 2;
  while (existing.some((p) => p.id === `${slug}-${n}`)) n++;
  return `${slug}-${n}`;
}
