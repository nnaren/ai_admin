import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerPluginRoutes } from '../../src/routes/plugins.js';
import { PluginStore } from '../../src/services/pluginStore.js';
import { PluginScanner } from '../../src/services/pluginScanner.js';
import { claudeCodeAdapter } from '../../src/services/plugins/claudeCode.js';
import { createDeepSeekAdapter } from '../../src/services/plugins/deepseek.js';
import type { PluginAdapter } from '../../src/services/plugins/types.js';

let tmpDir: string;
let home: string;
let app: FastifyInstance;
let store: PluginStore;
let scanner: PluginScanner;
let adapters: PluginAdapter[];

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gcp-plugins-route-'));
  home = path.join(tmpDir, 'home');
  await fs.mkdir(path.join(home, '.claude', 'plugins'), { recursive: true });

  store = new PluginStore(path.join(tmpDir, 'plugins.yaml'), home);
  await store.load();
  adapters = [claudeCodeAdapter];
  scanner = new PluginScanner(store, home, adapters);
  app = Fastify();
  registerPluginRoutes(app, scanner, store);
  await app.ready();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await app.close();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/** Point the scanner at a different adapter set without re-booting. */
function useAdapters(next: PluginAdapter[]): void {
  adapters = next;
  scanner = new PluginScanner(store, home, adapters);
  app = Fastify();
  registerPluginRoutes(app, scanner, store);
}

async function seedClaudeProject(dir: string): Promise<string> {
  const marketDir = path.join(home, '.claude', 'plugins', 'marketplaces', 'omc');
  await fs.mkdir(path.join(marketDir, 'src'), { recursive: true });
  await fs.writeFile(path.join(marketDir, 'src', 'index.js'), '//\n', 'utf8');
  await writeJson(path.join(marketDir, '.claude-plugin', 'marketplace.json'), {
    plugins: [{ name: 'omc-plugin', version: '1.0.0', source: './src' }],
  });
  await writeJson(path.join(home, '.claude', 'plugins', 'known_marketplaces.json'), {
    omc: { installLocation: marketDir },
  });
  await fs.mkdir(path.join(dir, '.claude'), { recursive: true });
  await fs.writeFile(path.join(dir, '.claude', '.keep'), '', 'utf8');
  return marketDir;
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2), 'utf8');
}

describe('GET /api/plugins', () => {
  it('returns tools and an empty project list', async () => {
    const resp = await app.inject({ method: 'GET', url: '/api/plugins' });
    expect(resp.statusCode).toBe(200);
    const body = resp.json();
    expect(body.home).toBe(home);
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0]).toMatchObject({ id: 'claudecode', label: 'Claude Code' });
    expect(body.projects).toEqual([]);
  });
});

describe('project routes', () => {
  it('adds a project by path and returns it already scanned', async () => {
    const projectDir = path.join(tmpDir, 'my-app');
    await fs.mkdir(projectDir, { recursive: true });
    await seedClaudeProject(projectDir);

    const resp = await app.inject({
      method: 'POST',
      url: '/api/plugins/projects',
      payload: { path: projectDir },
    });
    expect(resp.statusCode).toBe(201);
    const project = resp.json().project;
    expect(project).toMatchObject({ id: 'my-app', path: projectDir });
    expect(project.scopes.claudecode.present).toBe(true);
  });

  it('rejects a path that is not a directory on this machine', async () => {
    const resp = await app.inject({
      method: 'POST',
      url: '/api/plugins/projects',
      payload: { path: path.join(tmpDir, 'nope') },
    });
    expect(resp.statusCode).toBe(400);
    expect(resp.json().error).toMatch(/目录不存在/);
    expect(store.list()).toEqual([]);
  });

  it('rejects a missing or blank path', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/plugins/projects', payload: {} })).statusCode).toBe(400);
    expect(
      (await app.inject({ method: 'POST', url: '/api/plugins/projects', payload: { path: '  ' } })).statusCode,
    ).toBe(400);
  });

  it('reports a duplicate directory as a conflict', async () => {
    const projectDir = path.join(tmpDir, 'my-app');
    await fs.mkdir(projectDir, { recursive: true });
    const payload = { path: projectDir };
    expect((await app.inject({ method: 'POST', url: '/api/plugins/projects', payload })).statusCode).toBe(201);
    const second = await app.inject({ method: 'POST', url: '/api/plugins/projects', payload });
    expect(second.statusCode).toBe(409);
    expect(second.json().error).toMatch(/已在列表中/);
  });

  it('removes a project and 404s an unknown id', async () => {
    const projectDir = path.join(tmpDir, 'my-app');
    await fs.mkdir(projectDir, { recursive: true });
    await app.inject({ method: 'POST', url: '/api/plugins/projects', payload: { path: projectDir } });

    const removed = await app.inject({ method: 'DELETE', url: '/api/plugins/projects/my-app' });
    expect(removed.statusCode).toBe(204);
    expect(store.list()).toEqual([]);
    expect((await app.inject({ method: 'DELETE', url: '/api/plugins/projects/my-app' })).statusCode).toBe(404);
  });
});

describe('activate / deactivate', () => {
  beforeEach(async () => {
    await writeJson(path.join(home, '.claude', 'settings.json'), { enabledPlugins: {} });
    await writeJson(path.join(home, '.claude', 'plugins', 'installed_plugins.json'), {
      version: 2,
      plugins: { 'omc-plugin@omc': [{ scope: 'user', version: '1.0.0' }] },
    });
  });

  it('activates a user-scope plugin', async () => {
    const resp = await app.inject({
      method: 'POST',
      url: '/api/plugins/claudecode/user/omc-plugin%40omc/activate',
    });
    expect(resp.statusCode).toBe(200);
    const settings = JSON.parse(await fs.readFile(path.join(home, '.claude', 'settings.json'), 'utf8'));
    expect(settings.enabledPlugins['omc-plugin@omc']).toBe(true);
  });

  it('deactivates it again', async () => {
    await app.inject({ method: 'POST', url: '/api/plugins/claudecode/user/omc-plugin%40omc/activate' });
    const resp = await app.inject({
      method: 'POST',
      url: '/api/plugins/claudecode/user/omc-plugin%40omc/deactivate',
    });
    expect(resp.statusCode).toBe(200);
    const settings = JSON.parse(await fs.readFile(path.join(home, '.claude', 'settings.json'), 'utf8'));
    expect(settings.enabledPlugins['omc-plugin@omc']).toBeUndefined();
  });

  it('requires a project id for project scope', async () => {
    const resp = await app.inject({
      method: 'POST',
      url: '/api/plugins/claudecode/project/omc-plugin%40omc/activate',
    });
    expect(resp.statusCode).toBe(404);
    expect(resp.json().error).toMatch(/requires a project id/);
  });

  it('writes into the project settings, not the user settings', async () => {
    const projectDir = path.join(tmpDir, 'my-app');
    await seedClaudeProject(projectDir);
    await app.inject({ method: 'POST', url: '/api/plugins/projects', payload: { path: projectDir } });

    const resp = await app.inject({
      method: 'POST',
      url: '/api/plugins/claudecode/project/omc-plugin%40omc/activate?project=my-app',
    });
    expect(resp.statusCode).toBe(200);
    const projectSettings = JSON.parse(
      await fs.readFile(path.join(projectDir, '.claude', 'settings.json'), 'utf8'),
    );
    expect(projectSettings.enabledPlugins['omc-plugin@omc']).toBe(true);
    const userSettings = JSON.parse(await fs.readFile(path.join(home, '.claude', 'settings.json'), 'utf8'));
    expect(userSettings.enabledPlugins['omc-plugin@omc']).toBeUndefined();
  });

  it('404s an unknown tool and 404s an unknown action', async () => {
    expect(
      (await app.inject({ method: 'POST', url: '/api/plugins/nope/user/x%40y/activate' })).statusCode,
    ).toBe(404);
    const bad = await app.inject({ method: 'POST', url: '/api/plugins/claudecode/user/x%40y/reticulate' });
    expect(bad.statusCode).toBe(404);
  });

  it('turns a permission error into something actionable', async () => {
    const denied = Object.assign(new Error('EPERM: operation not permitted, unlink \'/x/y\''), {
      code: 'EPERM',
      path: '/x/y',
    });
    vi.spyOn(claudeCodeAdapter, 'setEnabled').mockRejectedValue(denied);
    const resp = await app.inject({
      method: 'POST',
      url: '/api/plugins/claudecode/user/omc-plugin%40omc/activate',
    });
    expect(resp.statusCode).toBe(409);
    expect(resp.json().error).toMatch(/没有写入权限：\/x\/y/);
    vi.restoreAllMocks();
  });

  it('surfaces a refused write as 409 with the reason', async () => {
    await fs.writeFile(path.join(home, '.claude', 'settings.json'), '{ not json', 'utf8');
    const resp = await app.inject({
      method: 'POST',
      url: '/api/plugins/claudecode/user/omc-plugin%40omc/activate',
    });
    expect(resp.statusCode).toBe(409);
    expect(resp.json().error).toMatch(/not valid JSON/);
  });
});

describe('install / uninstall', () => {
  it('installs from a marketplace and then uninstalls', async () => {
    await seedClaudeProject(home);

    const install = await app.inject({
      method: 'POST',
      url: '/api/plugins/claudecode/user/install',
      payload: { marketplace: 'omc', plugin: 'omc-plugin' },
    });
    expect(install.statusCode).toBe(200);
    expect(
      await fs.readFile(
        path.join(home, '.claude', 'plugins', 'cache', 'omc', 'omc-plugin', '1.0.0', 'index.js'),
        'utf8',
      ),
    ).toBe('//\n');

    const view = (await app.inject({ method: 'GET', url: '/api/plugins' })).json();
    expect(view.tools[0].userScope.plugins.map((p: { id: string }) => p.id)).toEqual(['omc-plugin@omc']);
    expect(view.tools[0].userScope.catalog.find((c: { id: string }) => c.id === 'omc-plugin@omc').name).toBe(
      'omc-plugin',
    );

    const removed = await app.inject({ method: 'DELETE', url: '/api/plugins/claudecode/user/omc-plugin%40omc' });
    expect(removed.statusCode).toBe(200);
    const after = (await app.inject({ method: 'GET', url: '/api/plugins' })).json();
    expect(after.tools[0].userScope.plugins).toEqual([]);
  });

  it('requires both marketplace and plugin', async () => {
    expect(
      (await app.inject({ method: 'POST', url: '/api/plugins/claudecode/user/install', payload: {} })).statusCode,
    ).toBe(400);
  });

  it('refuses to install for a tool the panel does not drive, with a reason', async () => {
    useAdapters([createDeepSeekForRoute()]);
    const resp = await app.inject({
      method: 'POST',
      url: '/api/plugins/deepseek/user/install',
      payload: { marketplace: 'dsh-bundles', plugin: '@deepseek-ai/dsh-base' },
    });
    expect(resp.statusCode).toBe(409);
    expect(resp.json().error).toMatch(/pnpm/);
  });

  it('409s an install of something the marketplace does not offer', async () => {
    await seedClaudeProject(home);
    const resp = await app.inject({
      method: 'POST',
      url: '/api/plugins/claudecode/user/install',
      payload: { marketplace: 'omc', plugin: 'ghost' },
    });
    expect(resp.statusCode).toBe(409);
    expect(resp.json().error).toMatch(/is not in marketplace/);
  });
});

/**
 * DeepSeek is not install-driven by the panel. The scan root is irrelevant to
 * that guard, so the stock adapter stands in.
 */
function createDeepSeekForRoute(): PluginAdapter {
  return createDeepSeekAdapter();
}
