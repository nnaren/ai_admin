/**
 * Claude Code plugin adapter.
 *
 * On-disk contract (verified against ~/.claude):
 *   <root>/.claude/plugins/installed_plugins.json
 *     { version: 2, plugins: { "omc@oh-my-claudecode": [{ scope, installPath,
 *       version, installedAt, lastUpdated, gitCommitSha }] } }
 *   <root>/.claude/plugins/known_marketplaces.json
 *     { omc: { source: {...}, installLocation, lastUpdated } }
 *   <installLocation>/.claude-plugin/marketplace.json  → the catalog
 *   <root>/.claude/settings.json → { enabledPlugins: { "name@market": bool } }
 *
 * The registry and the marketplace list are GLOBAL (always under the home
 * directory) and each entry carries its own scope; enablement is per-scope, so a
 * project can activate a plugin the user installed, without copying it.
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import type {
  CatalogPlugin,
  MarketplaceEntry,
  PluginEntry,
  PluginScopeView,
} from '../../types.js';
import {
  copyPluginDir,
  dirExists,
  PluginConfigError,
  readJsonFile,
  writeJsonFileSafe,
} from './fsUtils.js';
import { authorName, resolveCatalogSource, type CatalogFile } from './catalog.js';
import {
  pluginId,
  splitPluginId,
  type InstallRequest,
  type PluginAdapter,
  type PluginScopeTarget,
} from './types.js';

const SCOPE_DIR = '.claude';

interface InstalledRecord {
  scope?: string;
  installPath?: string;
  version?: string;
  installedAt?: string;
  lastUpdated?: string;
  gitCommitSha?: string;
}

interface InstalledFile {
  version?: number;
  plugins?: Record<string, InstalledRecord[]>;
}

interface MarketplaceSource {
  source?: string;
  url?: string;
  repo?: string;
}

interface KnownMarketplacesFile {
  [market: string]: {
    source?: MarketplaceSource;
    installLocation?: string;
    lastUpdated?: string;
  };
}

interface SettingsFile {
  enabledPlugins?: Record<string, boolean>;
  [key: string]: unknown;
}

export const claudeCodeAdapter: PluginAdapter = {
  id: 'claudecode',
  label: 'Claude Code',
  color: 'amber',
  canInstall: true,

  toolHome(root: string): string {
    return path.join(root, SCOPE_DIR);
  },

  async scan(target: PluginScopeTarget): Promise<Omit<PluginScopeView, 'scope' | 'root'>> {
    const scopeHome = this.toolHome(target.root);
    const present = await dirExists(scopeHome);
    if (!present) {
      return { present: false, plugins: [], marketplaces: [], catalog: [], canInstall: true };
    }

    const globalPluginsDir = this.toolHome(target.home);
    const installed = (await readJsonFile<InstalledFile>(path.join(globalPluginsDir, 'plugins', 'installed_plugins.json'))) ?? {};
    const settings = (await readJsonFile<SettingsFile>(path.join(scopeHome, 'settings.json'))) ?? {};
    const enabled = settings.enabledPlugins ?? {};

    const plugins = Object.entries(installed.plugins ?? {}).flatMap(([id, records]) => {
      const entry = pickScopedRecord(id, records, target.scope);
      // A project sees its own installs *and* any globally installed plugin it
      // activates — Claude Code lets a project turn a user-scope plugin on
      // through its own settings.json, and that is exactly the state worth
      // showing (and switching off) here.
      if (!entry && !(target.scope === 'project' && enabled[id] === true)) return [];
      const { name, marketplace } = safeSplit(id);
      const item: PluginEntry = {
        id,
        name,
        marketplace,
        enabled: enabled[id] === true,
      };
      if (entry?.version) item.version = entry.version;
      if (entry?.installPath) item.path = entry.installPath;
      if (entry?.installedAt) item.installedAt = entry.installedAt;
      if (entry?.lastUpdated) item.updatedAt = entry.lastUpdated;
      return [item];
    });

    const known = (await readJsonFile<KnownMarketplacesFile>(
      path.join(globalPluginsDir, 'plugins', 'known_marketplaces.json'),
    )) ?? {};

    const marketplaces: MarketplaceEntry[] = [];
    const catalog: CatalogPlugin[] = [];
    for (const [id, market] of Object.entries(known)) {
      const entry: MarketplaceEntry = { id, name: id };
      if (market.installLocation) entry.installLocation = market.installLocation;
      if (market.lastUpdated) entry.updatedAt = market.lastUpdated;
      const source = market.source;
      if (source?.url) entry.source = source.url;
      else if (source?.repo) entry.source = `github:${source.repo}`;
      marketplaces.push(entry);
      catalog.push(...(await readCatalog(id, market.installLocation)));
    }

    return { present: true, plugins, marketplaces, catalog, canInstall: true };
  },

  async setEnabled(target: PluginScopeTarget, id: string, on: boolean): Promise<void> {
    const file = path.join(this.toolHome(target.root), 'settings.json');
    const settings = (await readJsonFile<SettingsFile>(file)) ?? {};
    const current = { ...(settings.enabledPlugins ?? {}) };
    if (on) {
      current[id] = true;
    } else {
      delete current[id];
    }
    settings.enabledPlugins = current;
    await writeJsonFileSafe(file, settings);
  },

  async install(target: PluginScopeTarget, req: InstallRequest): Promise<void> {
    const id = pluginId(req.plugin, req.marketplace);
    const globalPluginsDir = this.toolHome(target.home);
    const known = (await readJsonFile<KnownMarketplacesFile>(
      path.join(globalPluginsDir, 'plugins', 'known_marketplaces.json'),
    )) ?? {};
    const market = known[req.marketplace];
    if (!market?.installLocation) {
      throw new PluginConfigError(`unknown marketplace "${req.marketplace}"`);
    }
    const catalog = await readCatalog(req.marketplace, market.installLocation);
    const offer = catalog.find((c) => c.name === req.plugin);
    if (!offer) {
      throw new PluginConfigError(`"${req.plugin}" is not in marketplace "${req.marketplace}"`);
    }
    const sourcePath = offer.sourcePath;
    if (!sourcePath) {
      throw new PluginConfigError(`"${id}" has no local source to install from`);
    }

    const version = offer.version ?? '0.0.0';
    const installPath = path.join(
      globalPluginsDir,
      'plugins',
      'cache',
      req.marketplace,
      req.plugin,
      version,
    );
    await copyPluginDir(sourcePath, installPath, market.installLocation);

    const file = path.join(globalPluginsDir, 'plugins', 'installed_plugins.json');
    const installed = (await readJsonFile<InstalledFile>(file)) ?? { version: 2, plugins: {} };
    const records = installed.plugins?.[id] ?? [];
    const now = new Date().toISOString();
    const kept = records.filter((r) => r.scope !== target.scope);
    kept.push({
      scope: target.scope,
      installPath,
      version,
      installedAt: now,
      lastUpdated: now,
    });
    installed.version = installed.version ?? 2;
    installed.plugins = { ...(installed.plugins ?? {}), [id]: kept };
    await writeJsonFileSafe(file, installed);

    await this.setEnabled(target, id, true);
  },

  async uninstall(target: PluginScopeTarget, id: string): Promise<void> {
    const globalPluginsDir = this.toolHome(target.home);
    const file = path.join(globalPluginsDir, 'plugins', 'installed_plugins.json');
    const installed = await readJsonFile<InstalledFile>(file);
    const records = installed?.plugins?.[id];
    if (!installed || !records) {
      throw new PluginConfigError(`plugin "${id}" is not installed`);
    }
    const kept = records.filter((r) => r.scope !== target.scope);
    if (kept.length === records.length) {
      throw new PluginConfigError(`"${id}" is not installed for this scope`);
    }
    const plugins = { ...(installed.plugins ?? {}) };
    if (kept.length === 0) delete plugins[id];
    else plugins[id] = kept;
    await writeJsonFileSafe(file, { ...installed, plugins });

    await this.setEnabled(target, id, false);

    // The cache copy is shared with the other scope. Drop it only when no
    // surviving record for this id still points at it.
    const removedPaths = new Set(records.map((r) => r.installPath).filter((p): p is string => Boolean(p)));
    const stillReferenced = new Set(kept.map((r) => r.installPath).filter((p): p is string => Boolean(p)));
    for (const orphan of removedPaths) {
      if (!stillReferenced.has(orphan)) await fs.rm(orphan, { recursive: true, force: true });
    }
  },
};

async function readCatalog(marketId: string, installLocation?: string): Promise<CatalogPlugin[]> {
  if (!installLocation) return [];
  const file = path.join(installLocation, '.claude-plugin', 'marketplace.json');
  const raw = await readJsonFile<CatalogFile>(file);
  if (!raw?.plugins?.length) return [];
  return raw.plugins.map((p) => {
    const item: CatalogPlugin = {
      id: pluginId(p.name, marketId),
      name: p.name,
      marketplace: marketId,
    };
    if (p.description) item.description = p.description;
    if (p.version) item.version = p.version;
    const author = authorName(p.author);
    if (author) item.author = author;
    if (p.category) item.category = p.category;
    if (p.homepage) item.homepage = p.homepage;
    if (p.tags?.length) item.tags = p.tags;
    const resolved = resolveCatalogSource(p.source, installLocation);
    if (resolved.path) item.sourcePath = resolved.path;
    if (resolved.label) item.source = resolved.label;
    return item;
  });
}

function pickScopedRecord(
  id: string,
  records: InstalledRecord[] | undefined,
  scope: PluginScopeTarget['scope'],
): InstalledRecord | undefined {
  const list = Array.isArray(records) ? records : [];
  const scoped = list.find((r) => r.scope === scope);
  if (scoped) return scoped;
  // Claude Code wrote scope-less entries in v1; treat those as user-scope only.
  return scope === 'user' ? list.find((r) => !r.scope) : undefined;
}

function safeSplit(id: string): { name: string; marketplace: string } {
  try {
    return splitPluginId(id);
  } catch {
    return { name: id, marketplace: '' };
  }
}
