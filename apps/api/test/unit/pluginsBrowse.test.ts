import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Fastify from 'fastify';
import { browseDirectories, defaultStartDirs } from '../../src/services/plugins/browse.js';
import { registerPluginRoutes } from '../../src/routes/plugins.js';
import { PluginStore } from '../../src/services/pluginStore.js';
import { PluginScanner } from '../../src/services/pluginScanner.js';
import { claudeCodeAdapter } from '../../src/services/plugins/claudeCode.js';

let root: string;
let home: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'gcp-browse-'));
  home = path.join(root, 'home');
  await fs.mkdir(path.join(home, 'code', 'my-app'), { recursive: true });
  await fs.mkdir(path.join(home, '.hidden'), { recursive: true });
  await fs.mkdir(path.join(home, 'node_modules', 'left-pad'), { recursive: true });
  await fs.writeFile(path.join(home, 'notes.md'), 'x', 'utf8');
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('browseDirectories', () => {
  it('lists subdirectories of the home directory by default', async () => {
    const result = await browseDirectories(undefined, home);
    expect(result.path).toBe(home);
    expect(result.home).toBe(true);
    expect(result.dirs.map((d) => d.name)).toEqual(['code']);
  });

  it('hides dotfiles, files and node_modules', async () => {
    const result = await browseDirectories(home, home);
    const names = result.dirs.map((d) => d.name);
    expect(names).not.toContain('.hidden');
    expect(names).not.toContain('notes.md');
    expect(names).not.toContain('node_modules');
  });

  it('descends and reports the parent', async () => {
    const result = await browseDirectories(path.join(home, 'code', 'my-app'), home);
    expect(result.dirs).toEqual([]);
    expect(result.home).toBe(false);
    expect(result.parent).toBe(path.join(home, 'code'));
  });

  it('expands a ~-prefixed path', async () => {
    const result = await browseDirectories('~/code', home);
    expect(result.path).toBe(path.join(home, 'code'));
    expect(result.dirs.map((d) => d.name)).toEqual(['my-app']);
  });

  it('reports a missing directory as an error instead of an empty list', async () => {
    const result = await browseDirectories(path.join(home, 'nope'), home);
    expect(result.error).toMatch(/目录不存在/);
    expect(result.dirs).toEqual([]);
  });

  it('reports a file as not-a-directory', async () => {
    const result = await browseDirectories(path.join(home, 'notes.md'), home);
    expect(result.error).toMatch(/不是目录/);
  });

  it('has no parent at the filesystem root', async () => {
    const result = await browseDirectories('/', home);
    expect(result.parent).toBeNull();
  });

  it('offers quick picks without duplicates', () => {
    const picks = defaultStartDirs(home);
    const paths = picks.map((p) => p.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toContain(home);
  });
});

describe('GET /api/plugins/browse', () => {
  async function makeApp() {
    const store = new PluginStore(path.join(root, 'plugins.yaml'), home);
    await store.load();
    const app = Fastify();
    registerPluginRoutes(app, new PluginScanner(store, home, [claudeCodeAdapter]), store);
    await app.ready();
    return app;
  }

  it('lists directories relative to the panel home', async () => {
    const app = await makeApp();
    const resp = await app.inject({ method: 'GET', url: '/api/plugins/browse' });
    expect(resp.statusCode).toBe(200);
    expect(resp.json()).toMatchObject({ path: home, home: true });
    expect(resp.json().dirs.map((d: { name: string }) => d.name)).toEqual(['code']);
    await app.close();
  });

  it('navigates into a chosen directory', async () => {
    const app = await makeApp();
    const target = path.join(home, 'code');
    const resp = await app.inject({
      method: 'GET',
      url: `/api/plugins/browse?path=${encodeURIComponent(target)}`,
    });
    expect(resp.json().dirs).toEqual([{ name: 'my-app', path: path.join(target, 'my-app') }]);
    await app.close();
  });

  it('answers 200 with an error field for a bad path', async () => {
    const app = await makeApp();
    const resp = await app.inject({
      method: 'GET',
      url: `/api/plugins/browse?path=${encodeURIComponent('/no/such/dir')}`,
    });
    expect(resp.statusCode).toBe(200);
    expect(resp.json().error).toMatch(/目录不存在/);
    await app.close();
  });
});
