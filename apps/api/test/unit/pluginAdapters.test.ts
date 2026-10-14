import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { claudeCodeAdapter } from '../../src/services/plugins/claudeCode.js';
import { codexAdapter, parsePluginTable, setPluginEnabled } from '../../src/services/plugins/codex.js';
import { createDeepSeekAdapter } from '../../src/services/plugins/deepseek.js';
import { resolveCatalogSource } from '../../src/services/plugins/catalog.js';
import type { PluginScopeTarget } from '../../src/services/plugins/types.js';

let home: string;
let project: string;

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'gcp-plugins-home-'));
  project = await fs.mkdtemp(path.join(os.tmpdir(), 'gcp-plugins-proj-'));
});

afterEach(async () => {
  await fs.rm(home, { recursive: true, force: true });
  await fs.rm(project, { recursive: true, force: true });
});

/** Resolved per test: `home`/`project` are only set in `beforeEach`. */
const userTarget = (): PluginScopeTarget => ({ scope: 'user', root: home, home });
const projectTarget = (): PluginScopeTarget => ({ scope: 'project', root: project, home, projectId: 'p1' });

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2), 'utf8');
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(file, 'utf8')) as T;
}

/** A home with one Claude marketplace, one installed plugin, enabled. */
async function seedClaude(): Promise<string> {
  const pluginsDir = path.join(home, '.claude', 'plugins');
  const marketDir = path.join(pluginsDir, 'marketplaces', 'omc');
  await fs.mkdir(path.join(marketDir, 'omc-src'), { recursive: true });
  await fs.writeFile(path.join(marketDir, 'omc-src', 'index.js'), '// plugin\n', 'utf8');
  await writeJson(path.join(marketDir, '.claude-plugin', 'marketplace.json'), {
    name: 'omc',
    plugins: [
      { name: 'omc-plugin', version: '5.3.0', source: './omc-src', description: 'local one' },
      { name: 'remote-plugin', source: { source: 'github', repo: 'owner/repo' } },
    ],
  });
  await writeJson(path.join(pluginsDir, 'known_marketplaces.json'), {
    omc: { source: { source: 'git', url: 'https://github.com/x/y.git' }, installLocation: marketDir },
  });
  await writeJson(path.join(pluginsDir, 'installed_plugins.json'), {
    version: 2,
    plugins: {
      'omc-plugin@omc': [
        {
          scope: 'user',
          installPath: path.join(pluginsDir, 'cache', 'omc', 'omc-plugin', '5.3.0'),
          version: '5.3.0',
          installedAt: '2026-09-06T11:46:01.770Z',
        },
      ],
      'proj-plugin@omc': [{ scope: 'project', installPath: '/tmp/elsewhere', version: '1.0.0' }],
    },
  });
  await writeJson(path.join(home, '.claude', 'settings.json'), {
    theme: 'dark',
    enabledPlugins: { 'omc-plugin@omc': true },
  });
  return marketDir;
}

describe('claudeCode adapter', () => {
  it('reports user-scope plugins, marketplaces and catalog with local sources only', async () => {
    const marketDir = await seedClaude();
    const view = await claudeCodeAdapter.scan(userTarget());

    expect(view.present).toBe(true);
    expect(view.plugins).toHaveLength(1);
    expect(view.plugins[0]).toMatchObject({
      id: 'omc-plugin@omc',
      name: 'omc-plugin',
      marketplace: 'omc',
      version: '5.3.0',
      enabled: true,
      installedAt: '2026-09-06T11:46:01.770Z',
    });
    expect(view.marketplaces).toEqual([
      expect.objectContaining({ id: 'omc', source: 'https://github.com/x/y.git', installLocation: marketDir }),
    ]);
    expect(view.catalog.map((c) => c.id).sort()).toEqual(['omc-plugin@omc', 'remote-plugin@omc']);
    // A remote-only offer is listed but not installable from disk.
    expect(view.catalog.find((c) => c.name === 'omc-plugin')?.sourcePath).toBe(
      path.join(marketDir, 'omc-src'),
    );
    expect(view.catalog.find((c) => c.name === 'remote-plugin')?.sourcePath).toBeUndefined();
    expect(view.catalog.find((c) => c.name === 'remote-plugin')?.source).toBe('github:owner/repo');
  });

  it('keeps project-scope plugins out of the user scope and vice versa', async () => {
    await seedClaude();
    const userView = await claudeCodeAdapter.scan(userTarget());
    expect(userView.plugins.map((p) => p.id)).toEqual(['omc-plugin@omc']);

    // A project activates a globally installed plugin through its own settings.
    await writeJson(path.join(project, '.claude', 'settings.json'), {
      enabledPlugins: { 'omc-plugin@omc': true },
    });
    const projView = await claudeCodeAdapter.scan(projectTarget());
    expect(projView.present).toBe(true);
    // Its own install, plus the user-scope plugin this project activates.
    expect(projView.plugins.map((p) => p.id)).toEqual(['omc-plugin@omc', 'proj-plugin@omc']);
    // The project enabled only the first one; its own install stays dormant.
    expect(projView.plugins.map((p) => p.enabled)).toEqual([true, false]);
  });

  it('reports a missing project scope as absent rather than empty-but-present', async () => {
    const view = await claudeCodeAdapter.scan(projectTarget());
    expect(view).toMatchObject({ present: false, plugins: [], catalog: [] });
  });

  it('activates by writing only enabledPlugins, preserving other settings', async () => {
    await seedClaude();
    await claudeCodeAdapter.setEnabled(userTarget(), 'proj-plugin@omc', true);

    const settings = await readJson<{ theme: string; enabledPlugins: Record<string, boolean> }>(
      path.join(home, '.claude', 'settings.json'),
    );
    expect(settings.theme).toBe('dark');
    expect(settings.enabledPlugins).toEqual({
      'omc-plugin@omc': true,
      'proj-plugin@omc': true,
    });

    await claudeCodeAdapter.setEnabled(userTarget(), 'omc-plugin@omc', false);
    const after = await readJson<{ enabledPlugins: Record<string, boolean> }>(
      path.join(home, '.claude', 'settings.json'),
    );
    expect(after.enabledPlugins).toEqual({ 'proj-plugin@omc': true });
  });

  it('installs from a local marketplace source, registers the scope and activates it', async () => {
    const marketDir = await seedClaude();
    await claudeCodeAdapter.install(userTarget(), { marketplace: 'omc', plugin: 'omc-plugin' });

    const installedDir = path.join(home, '.claude', 'plugins', 'cache', 'omc', 'omc-plugin', '5.3.0');
    expect(await fs.readFile(path.join(installedDir, 'index.js'), 'utf8')).toBe('// plugin\n');

    const registry = await readJson<{ plugins: Record<string, { scope: string; installPath: string }[]> }>(
      path.join(home, '.claude', 'plugins', 'installed_plugins.json'),
    );
    expect(registry.plugins['omc-plugin@omc']).toHaveLength(1);
    expect(registry.plugins['omc-plugin@omc'][0]).toMatchObject({ scope: 'user', installPath: installedDir });

    const settings = await readJson<{ enabledPlugins: Record<string, boolean> }>(
      path.join(home, '.claude', 'settings.json'),
    );
    expect(settings.enabledPlugins['omc-plugin@omc']).toBe(true);
    expect(marketDir).toContain('omc');
  });

  it('installs for a project without disturbing the user-scope record', async () => {
    await seedClaude();
    await claudeCodeAdapter.install(projectTarget(), { marketplace: 'omc', plugin: 'omc-plugin' });

    const registry = await readJson<{ plugins: Record<string, { scope: string }[]> }>(
      path.join(home, '.claude', 'plugins', 'installed_plugins.json'),
    );
    expect(registry.plugins['omc-plugin@omc'].map((r) => r.scope).sort()).toEqual(['project', 'user']);
    const settings = await readJson<{ enabledPlugins: Record<string, boolean> }>(
      path.join(project, '.claude', 'settings.json'),
    );
    expect(settings.enabledPlugins).toEqual({ 'omc-plugin@omc': true });
  });

  it('refuses an unknown marketplace or plugin instead of writing a partial install', async () => {
    await seedClaude();
    await expect(
      claudeCodeAdapter.install(userTarget(), { marketplace: 'nope', plugin: 'omc-plugin' }),
    ).rejects.toThrow('unknown marketplace');
    await expect(
      claudeCodeAdapter.install(userTarget(), { marketplace: 'omc', plugin: 'not-there' }),
    ).rejects.toThrow('is not in marketplace');
    const settings = await readJson<{ enabledPlugins: Record<string, boolean> }>(
      path.join(home, '.claude', 'settings.json'),
    );
    expect(settings.enabledPlugins).toEqual({ 'omc-plugin@omc': true });
  });

  it('uninstalls one scope and keeps the shared cache when the other still needs it', async () => {
    await seedClaude();
    await claudeCodeAdapter.install(projectTarget(), { marketplace: 'omc', plugin: 'omc-plugin' });
    const installPath = path.join(home, '.claude', 'plugins', 'cache', 'omc', 'omc-plugin', '5.3.0');
    await fs.mkdir(installPath, { recursive: true });

    await claudeCodeAdapter.uninstall(userTarget(), 'omc-plugin@omc');
    const afterUser = await readJson<{ plugins: Record<string, { scope: string }[]> }>(
      path.join(home, '.claude', 'plugins', 'installed_plugins.json'),
    );
    expect(afterUser.plugins['omc-plugin@omc'].map((r) => r.scope)).toEqual(['project']);
    // still referenced by the project record → cache kept
    expect(await fs.stat(installPath)).toBeTruthy();

    await claudeCodeAdapter.uninstall(projectTarget(), 'omc-plugin@omc');
    const afterProject = await readJson<{ plugins: Record<string, unknown> }>(
      path.join(home, '.claude', 'plugins', 'installed_plugins.json'),
    );
    expect(afterProject.plugins['omc-plugin@omc']).toBeUndefined();
    await expect(fs.stat(installPath)).rejects.toThrow();
  });

  it('surfaces an unparseable config as an error instead of an empty inventory', async () => {
    await seedClaude();
    await fs.writeFile(path.join(home, '.claude', 'settings.json'), '{ broken', 'utf8');
    await expect(claudeCodeAdapter.scan(userTarget())).rejects.toThrow(/not valid JSON/);
  });

  it('keeps a .bak of every file it rewrites', async () => {
    await seedClaude();
    await claudeCodeAdapter.setEnabled(userTarget(), 'omc-plugin@omc', false);
    const backup = await fs.readFile(path.join(home, '.claude', 'settings.json.bak'), 'utf8');
    expect(JSON.parse(backup).enabledPlugins['omc-plugin@omc']).toBe(true);
  });
});

describe('codex adapter', () => {
  async function seedCodex(): Promise<void> {
    const pluginsDir = path.join(home, '.codex', 'plugins');
    await fs.mkdir(path.join(pluginsDir, 'cache', 'openai-bundled', 'code-review', '26.1'), {
      recursive: true,
    });
    await fs.mkdir(path.join(home, '.codex'), { recursive: true });
    await fs.writeFile(
      path.join(home, '.codex', 'config.toml'),
      [
        'model = "gpt-5"',
        '',
        '[projects."/tmp/x"]',
        'trust_level = "trusted"',
        '',
        '[plugins."code-review@openai-bundled"]',
        'enabled = true',
        '',
        '[plugins."browser@openai-bundled"]',
        'enabled = false',
        '',
        '[mcp_servers]',
        '',
      ].join('\n'),
      'utf8',
    );
  }

  it('parses only the plugins table and ignores everything else', () => {
    const toml = [
      '[plugins."a@b"]',
      'enabled = false',
      '[plugins.c]',
      'enabled = true',
      '[mcp_servers.node_repl]',
      'enabled = false',
    ].join('\n');
    expect(parsePluginTable(toml)).toEqual({ 'a@b': false, c: true });
  });

  it('defaults a plugins section without an explicit enabled flag to enabled', () => {
    expect(parsePluginTable('[plugins."a@b"]\nsource = "x"')).toEqual({ 'a@b': true });
  });

  it('replaces only the managed section when toggling', () => {
    const toml = ['model = "gpt-5"', '', '[plugins."a@b"]', 'enabled = true', '', '[features]', 'web = true', ''].join('\n');
    const next = setPluginEnabled(toml, 'a@b', false);
    expect(next).toContain('[plugins."a@b"]\nenabled = false');
    expect(next).toContain('model = "gpt-5"');
    expect(next).toContain('[features]\nweb = true');
    expect(parsePluginTable(next)).toEqual({ 'a@b': false });
  });

  it('appends a section for a plugin that is not listed yet', () => {
    const next = setPluginEnabled('model = "gpt-5"\n', 'new@market', true);
    expect(parsePluginTable(next)).toEqual({ 'new@market': true });
    expect(next).toContain('model = "gpt-5"');
  });

  it('scans installed plugins with versions from the cache', async () => {
    await seedCodex();
    const view = await codexAdapter.scan(userTarget());
    expect(view.present).toBe(true);
    expect(view.plugins).toEqual([
      expect.objectContaining({ id: 'code-review@openai-bundled', version: '26.1', enabled: true }),
      expect.objectContaining({ id: 'browser@openai-bundled', enabled: false }),
    ]);
    // A cache dir without a catalog file is still offered as an install source.
    expect(view.marketplaces.map((m) => m.id)).toEqual(['openai-bundled']);
    expect(view.catalog).toEqual([
      expect.objectContaining({ id: 'code-review@openai-bundled', version: '26.1' }),
    ]);
  });

  it('reports a registered plugin that is missing from the cache without a dangling path', async () => {
    await seedCodex();
    await fs.writeFile(
      path.join(home, '.codex', 'config.toml'),
      '[plugins."ghost@openai-bundled"]\nenabled = true\n',
      'utf8',
    );
    const view = await codexAdapter.scan(userTarget());
    expect(view.plugins[0].id).toBe('ghost@openai-bundled');
    expect(view.plugins[0].version).toBeUndefined();
    expect(view.plugins[0].path).toBe(
      path.join(home, '.codex', 'plugins', 'cache', 'openai-bundled', 'ghost'),
    );
  });

  it('deactivates in place, leaving the rest of config.toml untouched', async () => {
    await seedCodex();
    await codexAdapter.setEnabled(userTarget(), 'code-review@openai-bundled', false);
    const toml = await fs.readFile(path.join(home, '.codex', 'config.toml'), 'utf8');
    expect(parsePluginTable(toml)['code-review@openai-bundled']).toBe(false);
    expect(toml).toContain('[projects."/tmp/x"]');
    expect(toml).toContain('[mcp_servers]');
  });

  it('uninstalls by dropping the section and the cache dir', async () => {
    await seedCodex();
    await codexAdapter.uninstall(userTarget(), 'code-review@openai-bundled');
    const toml = await fs.readFile(path.join(home, '.codex', 'config.toml'), 'utf8');
    expect(parsePluginTable(toml)['code-review@openai-bundled']).toBeUndefined();
    expect(toml).toContain('model = "gpt-5"');
    await expect(
      fs.stat(path.join(home, '.codex', 'plugins', 'cache', 'openai-bundled', 'code-review')),
    ).rejects.toThrow();
  });

  it('rejects uninstalling something that was never installed', async () => {
    await seedCodex();
    await expect(codexAdapter.uninstall(userTarget(), 'ghost@nowhere')).rejects.toThrow(/not installed/);
  });

  it('refuses to install from a marketplace whose plugin source escapes the checkout', async () => {
    await seedCodex();
    await writeJson(
      path.join(home, '.codex', 'plugins', 'cache', 'openai-bundled', '.claude-plugin', 'marketplace.json'),
      { plugins: [{ name: 'evil', source: '../../../../etc' }] },
    );
    // A source that escapes the checkout is not offered as installable…
    const view = await codexAdapter.scan(userTarget());
    const evil = view.catalog.find((c) => c.name === 'evil');
    expect(evil?.source).toBe('../../../../etc');
    expect(evil?.sourcePath).toBeUndefined();
    // …and asking to install it anyway fails instead of copying /etc.
    await expect(
      codexAdapter.install(userTarget(), { marketplace: 'openai-bundled', plugin: 'evil' }),
    ).rejects.toThrow(/no local source/);
  });
});

describe('deepseek adapter', () => {
  async function seedDsh(): Promise<void> {
    const profileDir = path.join(home, '.dsh', 'profiles', 'desktop');
    await fs.mkdir(profileDir, { recursive: true });
    await fs.writeFile(path.join(profileDir, 'cordis.yml'), '[]\n', 'utf8');
    await fs.writeFile(path.join(profileDir, 'cordis.patch.yml'), '- "@deepseek-ai/dsh-extra"\n', 'utf8');
    await writeJson(path.join(profileDir, 'package.json'), {
      name: 'dsh-profile-desktop',
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
    });
  }

  it('composes the base and patch entry lists into installed plugins', async () => {
    await seedDsh();
    const view = await createDeepSeekAdapter().scan(userTarget());
    expect(view.present).toBe(true);
    expect(view.canInstall).toBe(false);
    expect(view.plugins.map((p) => p.id)).toEqual([
      '@deepseek-ai/dsh-extra@dsh-bundles',
    ]);
    expect(view.plugins[0]).toMatchObject({ enabled: true, source: 'npm:@deepseek-ai/dsh-extra' });
    expect(view.catalog.map((c) => c.id)).toEqual([
      '@deepseek-ai/dsh-base@dsh-bundles',
      '@deepseek-ai/dsh-web-app@dsh-bundles',
    ]);
  });

  it('disables by rewriting the documented patch file only', async () => {
    await seedDsh();
    const adapter = createDeepSeekAdapter();
    await adapter.setEnabled(userTarget(), '@deepseek-ai/dsh-extra@dsh-bundles', false);
    const profileDir = path.join(home, '.dsh', 'profiles', 'desktop');
    expect((await fs.readFile(path.join(profileDir, 'cordis.patch.yml'), 'utf8')).trim()).toBe('[]');
    expect(await fs.readFile(path.join(profileDir, 'cordis.yml'), 'utf8')).toBe('[]\n');

    await adapter.setEnabled(userTarget(), '@deepseek-ai/dsh-base@dsh-bundles', true);
    const after = await fs.readFile(path.join(profileDir, 'cordis.patch.yml'), 'utf8');
    expect(after).toContain('@deepseek-ai/dsh-base');
    expect(after).not.toContain('dsh-extra');
  });

  it('refuses to install and says why', async () => {
    await seedDsh();
    await expect(
      createDeepSeekAdapter().install(userTarget(), { marketplace: 'dsh-bundles', plugin: '@deepseek-ai/dsh-base' }),
    ).rejects.toThrow(/pnpm/);
  });

  it('reports absent when the project has no dsh directory', async () => {
    await seedDsh();
    const view = await createDeepSeekAdapter().scan(projectTarget());
    expect(view).toMatchObject({ present: false, plugins: [] });
  });

  it('surfaces a non-list patch file as an error', async () => {
    await seedDsh();
    await fs.writeFile(
      path.join(home, '.dsh', 'profiles', 'desktop', 'cordis.patch.yml'),
      'plugins: not-a-list\n',
      'utf8',
    );
    await expect(createDeepSeekAdapter().scan(userTarget())).rejects.toThrow(/not a list/);
  });
});

describe('marketplace catalog source', () => {
  it('accepts a relative path inside the checkout', () => {
    const out = resolveCatalogSource('./plugins/foo', '/mkt/root');
    expect(out).toEqual({ path: '/mkt/root/plugins/foo', label: './plugins/foo' });
  });

  it('refuses a path that escapes the checkout', () => {
    const out = resolveCatalogSource('../../../etc', '/mkt/root');
    expect(out).toEqual({ label: '../../../etc' });
  });

  it('describes remote sources without a local path', () => {
    expect(resolveCatalogSource({ source: 'github', repo: 'a/b', ref: 'main' }, '/mkt')).toEqual({
      label: 'github:a/b#main',
    });
    expect(resolveCatalogSource({ source: 'url', url: 'https://x/y' }, '/mkt')).toEqual({
      label: 'https://x/y',
    });
    expect(resolveCatalogSource(undefined, '/mkt')).toEqual({});
  });
});
