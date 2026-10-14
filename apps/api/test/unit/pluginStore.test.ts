import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parse as parseYaml } from 'yaml';
import { PluginStore } from '../../src/services/pluginStore.js';
import { PluginScanner } from '../../src/services/pluginScanner.js';
import { createDeepSeekAdapter } from '../../src/services/plugins/deepseek.js';
import { claudeCodeAdapter } from '../../src/services/plugins/claudeCode.js';
import type { PluginAdapter } from '../../src/services/plugins/types.js';

let tmpDir: string;
let home: string;
let pluginsPath: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gcp-pluginstore-'));
  home = path.join(tmpDir, 'home');
  pluginsPath = path.join(tmpDir, 'plugins.yaml');
  await fs.mkdir(home, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function makeStore(): Promise<PluginStore> {
  const store = new PluginStore(pluginsPath, home);
  await store.load();
  return store;
}

describe('PluginStore', () => {
  it('starts empty when the file does not exist', async () => {
    const store = await makeStore();
    expect(store.list()).toEqual([]);
  });

  it('adds a project by absolute path and persists it', async () => {
    const store = await makeStore();
    const project = await store.add('/tmp/some/cool-app');

    expect(project).toMatchObject({ id: 'cool-app', name: 'cool-app', path: '/tmp/some/cool-app' });
    expect(project.addedAt).toBeTruthy();

    const reloaded = await makeStore();
    expect(reloaded.list()).toEqual([project]);
  });

  it('expands a ~-prefixed path against the home directory', async () => {
    const store = await makeStore();
    const project = await store.add('~/code/my-app');
    expect(project.path).toBe(path.join(home, 'code/my-app'));
    expect(path.isAbsolute(project.path)).toBe(true);
  });

  it('rejects the same directory twice', async () => {
    const store = await makeStore();
    await store.add('/tmp/a/app');
    await expect(store.add('/tmp/a/app/')).rejects.toThrow(/已在列表中/);
    expect(store.list()).toHaveLength(1);
  });

  it('gives colliding basenames distinct ids', async () => {
    const store = await makeStore();
    const first = await store.add('/tmp/one/my-app');
    const second = await store.add('/tmp/two/my-app');
    expect(first.id).toBe('my-app');
    expect(second.id).toBe('my-app-2');
  });

  it('keeps ids ASCII-safe, falling back for a fully non-ascii name', async () => {
    const store = await makeStore();
    const mixed = await store.add('/tmp/我的 My App');
    expect(mixed.id).toBe('my-app');
    expect(mixed.name).toBe('我的 My App');

    const cjk = await store.add('/tmp/我的项目');
    expect(cjk.id).toMatch(/^[a-z0-9-]+$/);
    expect(cjk.name).toBe('我的项目');
  });

  it('removes a project and reports unknown ids', async () => {
    const store = await makeStore();
    await store.add('/tmp/a/app');
    await store.remove('app');
    expect(store.list()).toEqual([]);
    await expect(store.remove('app')).rejects.toThrow(/未知项目/);
  });

  it('survives a corrupted file rather than silently starting empty', async () => {
    await fs.writeFile(pluginsPath, 'projects: [\n  - broken', 'utf8');
    await expect(makeStore()).rejects.toThrow(/not valid YAML/);
  });

  it('normalizes ~ paths written by an older hand edit', async () => {
    await fs.writeFile(
      pluginsPath,
      ['projects:', '  - id: old', '    path: ~/code/old', ''].join('\n'),
      'utf8',
    );
    const store = await makeStore();
    expect(store.get('old')?.path).toBe(path.join(home, 'code/old'));
    expect(store.get('old')?.name).toBe('old');
  });

  it('writes YAML the panel can read back', async () => {
    const store = await makeStore();
    await store.add('/tmp/a/app');
    const raw = await fs.readFile(pluginsPath, 'utf8');
    expect(parseYaml(raw)).toMatchObject({ projects: [{ id: 'app', path: '/tmp/a/app' }] });
  });
});

describe('PluginScanner', () => {
  /** Two tools, both reporting present, to check the merged overview shape. */
  const stub = (id: 'claudecode' | 'deepseek', label: string): PluginAdapter => ({
    id,
    label,
    color: 'blue',
    canInstall: true,
    toolHome: (root: string) => path.join(root, `.${id}`),
    scan: async (target) => ({
      present: true,
      plugins: [{ id: `p@${id}`, name: 'p', marketplace: id, enabled: target.scope === 'user' }],
      marketplaces: [{ id: id, name: label }],
      catalog: [{ id: `p@${id}`, name: 'p', marketplace: id }],
      canInstall: true,
    }),
    setEnabled: async () => undefined,
    install: async () => undefined,
    uninstall: async () => undefined,
  });

  it('scans every tool and every registered project', async () => {
    const store = await makeStore();
    await store.add('/tmp/a/app');
    await store.add('/tmp/b/app');
    const scanner = new PluginScanner(store, home, [
      stub('claudecode', 'Claude Code'),
      stub('deepseek', 'DeepSeek'),
    ]);

    const overview = await scanner.overview();
    expect(overview.home).toBe(home);
    expect(overview.refreshedAt).toBeTruthy();
    expect(overview.tools.map((t) => t.id)).toEqual(['claudecode', 'deepseek']);
    expect(overview.tools[0].userScope.plugins[0].enabled).toBe(true);
    expect(overview.projects).toHaveLength(2);
    expect(Object.keys(overview.projects[0].scopes)).toEqual(['claudecode', 'deepseek']);
    expect(overview.projects[0].scopes.claudecode?.plugins[0].enabled).toBe(false);
  });

  it('isolates one tool failure instead of blanking the tab', async () => {
    const store = await makeStore();
    const broken: PluginAdapter = {
      ...stub('claudecode', 'Claude Code'),
      scan: async () => {
        throw new Error('settings.json is not valid JSON');
      },
    };
    const scanner = new PluginScanner(store, home, [broken, stub('deepseek', 'DeepSeek')]);

    const overview = await scanner.overview();
    expect(overview.tools[0].userScope.lastError).toMatch(/not valid JSON/);
    expect(overview.tools[0].userScope.plugins).toEqual([]);
    expect(overview.tools[1].userScope.lastError).toBeUndefined();
    expect(overview.tools[1].userScope.plugins).toHaveLength(1);
  });

  it('resolves mutation targets and refuses unknown ones', async () => {
    const store = await makeStore();
    await store.add('/tmp/a/app');
    const scanner = new PluginScanner(store, home, [claudeCodeAdapter, createDeepSeekAdapter()]);

    const user = await scanner.target('claudecode', 'user');
    expect(user.target).toEqual({ scope: 'user', root: home, home });

    const proj = await scanner.target('claudecode', 'project', 'app');
    expect(proj.target).toMatchObject({ scope: 'project', root: '/tmp/a/app', projectId: 'app' });

    await expect(scanner.target('claudecode', 'project')).rejects.toThrow(/requires a project id/);
    await expect(scanner.target('claudecode', 'project', 'ghost')).rejects.toThrow(/unknown project/);
    await expect(scanner.target('nope', 'user')).rejects.toThrow(/unknown plugin tool/);
  });
});
