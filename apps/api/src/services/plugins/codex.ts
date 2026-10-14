/**
 * Codex plugin adapter.
 *
 * On-disk contract (verified against ~/.codex):
 *   <root>/.codex/config.toml → [plugins."name@marketplace"] \n enabled = true
 *   <root>/.codex/plugins/cache/<marketplace>/<plugin>/<version>/
 *
 * There is no separate "installed" file: a `[plugins.*]` section *is* the
 * registry, and `enabled = false` keeps a plugin installed but inactive.
 * Marketplaces are the directories under `plugins/cache`, each optionally
 * carrying a `.claude-plugin/marketplace.json` catalog like Claude Code's.
 *
 * config.toml belongs to Codex and is shared with dozens of unrelated settings,
 * so it is edited line-by-line: the one section we manage is replaced, and every
 * other byte of the file is preserved verbatim. A full TOML parse/serialize
 * would silently rewrite the user's whole file.
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
  listDirNames,
  PluginConfigError,
  readJsonFile,
  readTextFile,
  writeTextFileSafe,
} from './fsUtils.js';
import { authorName, resolveCatalogSource, type CatalogFile } from './catalog.js';
import { pluginId, splitPluginId, type InstallRequest, type PluginAdapter, type PluginScopeTarget } from './types.js';

const SCOPE_DIR = '.codex';

export const codexAdapter: PluginAdapter = {
  id: 'codex',
  label: 'Codex',
  color: 'green',
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

    const globalHome = this.toolHome(target.home);
    const registry = parsePluginTable((await readTextFile(path.join(scopeHome, 'config.toml'))) ?? '');

    const plugins: PluginEntry[] = await Promise.all(
      Object.entries(registry).map(async ([id, enabled]) => {
        const { name, marketplace } = safeSplit(id);
        const item: PluginEntry = { id, name, marketplace, enabled };
        const pluginDir = path.join(globalHome, 'plugins', 'cache', marketplace, name);
        const version = await latestVersionDir(pluginDir);
        if (version) {
          item.version = version;
          item.path = path.join(pluginDir, version);
        } else {
          // Registered but not in the cache: point at the plugin directory
          // rather than a path with a dangling empty version segment.
          item.path = pluginDir;
        }
        return item;
      }),
    );

    const cacheDir = path.join(globalHome, 'plugins', 'cache');
    const marketplaces: MarketplaceEntry[] = [];
    const catalog: CatalogPlugin[] = [];
    for (const market of await listDirNames(cacheDir)) {
      const location = path.join(cacheDir, market);
      marketplaces.push({ id: market, name: market, installLocation: location });
      catalog.push(...(await readCatalog(market, location)));
    }

    return { present: true, plugins, marketplaces, catalog, canInstall: true };
  },

  async setEnabled(target: PluginScopeTarget, id: string, on: boolean): Promise<void> {
    const file = path.join(this.toolHome(target.root), 'config.toml');
    await writeTextFileSafe(file, setPluginEnabled(await readTextFile(file), id, on));
  },

  async install(target: PluginScopeTarget, req: InstallRequest): Promise<void> {
    const globalHome = this.toolHome(target.home);
    const location = path.join(globalHome, 'plugins', 'cache', req.marketplace);
    if (!(await dirExists(location))) {
      throw new PluginConfigError(`unknown marketplace "${req.marketplace}"`);
    }
    const catalog = await readCatalog(req.marketplace, location);
    const offer = catalog.find((c) => c.name === req.plugin);
    if (!offer?.sourcePath) {
      throw new PluginConfigError(
        `"${pluginId(req.plugin, req.marketplace)}" has no local source to install from`,
      );
    }
    const version = offer.version ?? '0.0.0';
    await copyPluginDir(
      offer.sourcePath,
      path.join(location, req.plugin, version),
      location,
    );
    const file = path.join(this.toolHome(target.root), 'config.toml');
    await writeTextFileSafe(
      file,
      setPluginEnabled(await readTextFile(file), pluginId(req.plugin, req.marketplace), true),
    );
  },

  async uninstall(target: PluginScopeTarget, id: string): Promise<void> {
    const scopeHome = this.toolHome(target.root);
    const file = path.join(scopeHome, 'config.toml');
    const removed = removePluginSection(await readTextFile(file), id);
    await writeTextFileSafe(file, removed.text);
    if (removed.absent) {
      throw new PluginConfigError(`plugin "${id}" is not installed`);
    }
    // Only the cache is left to clean, and only when no other scope in the
    // global table still references this id.
    const globalText = await readTextFile(path.join(this.toolHome(target.home), 'config.toml'));
    if (globalText && Object.keys(parsePluginTable(globalText)).some((k) => k === id)) return;
    const { name, marketplace } = splitPluginId(id);
    await fs.rm(path.join(this.toolHome(target.home), 'plugins', 'cache', marketplace, name), {
      recursive: true,
      force: true,
    });
  },
};

/* ----------------------------- config.toml ----------------------------- */

/**
 * Parse the `[plugins."name@marketplace"]` tables and their `enabled` flag.
 * Any other table, and any malformed line, is ignored — this file is the user's,
 * not ours.
 */
export function parsePluginTable(toml: string): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  let current: string | null = null;
  for (const raw of toml.split('\n')) {
    const line = raw.trim();
    const header = matchPluginHeader(line);
    if (header) {
      current = header;
      // `enabled` defaults to true when the section omits it.
      if (!(header in out)) out[header] = true;
      continue;
    }
    if (!current) continue;
    if (line.startsWith('[')) {
      current = null; // left the plugins table
      continue;
    }
    const enabled = /^enabled\s*=\s*(true|false)\s*(#.*)?$/.exec(line);
    if (enabled) out[current] = enabled[1] === 'true';
  }
  return out;
}

/** `[plugins."x"]` and `[plugins.x]` are both emitted by Codex. */
function matchPluginHeader(line: string): string | null {
  const m = /^\[plugins\.(?:"([^"]+)"|([A-Za-z0-9_.@-]+))\]$/.exec(line);
  if (!m) return null;
  return m[1] ?? m[2] ?? null;
}

/** Replace (or append) one `[plugins.*]` section, leaving the rest byte-identical. */
export function setPluginEnabled(toml: string | undefined, id: string, enabled: boolean): string {
  const base = toml ?? '';
  // The trailing newline matters: the replaced section is followed by whatever
  // came next, and gluing `enabled = false` onto `[features]` would make TOML
  // stop seeing the value at all.
  const replacement = `[plugins."${id}"]\nenabled = ${enabled ? 'true' : 'false'}\n`;
  const section = new RegExp(
    `\\[plugins\\.(?:"${escapeRegExp(id)}"|${escapeRegExp(id)})\\][^\\[]*`,
  );
  if (section.test(base)) return base.replace(section, replacement);

  const trimmed = base.replace(/\s+$/, '');
  const prefix = trimmed.length === 0 ? '' : `${trimmed}\n\n`;
  return `${prefix}${replacement}`;
}

/** Drop one `[plugins.*]` section entirely. `absent` = there was nothing to drop. */
function removePluginSection(toml: string | undefined, id: string): { text: string; absent: boolean } {
  const base = toml ?? '';
  const section = new RegExp(
    `\\[plugins\\.(?:"${escapeRegExp(id)}"|${escapeRegExp(id)})\\][^\\[]*`,
  );
  if (!section.test(base)) return { text: base, absent: true };
  return { text: base.replace(section, '').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '\n'), absent: false };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ------------------------------- catalog ------------------------------- */

async function readCatalog(marketId: string, location: string): Promise<CatalogPlugin[]> {
  const raw = await readJsonFile<CatalogFile>(
    path.join(location, '.claude-plugin', 'marketplace.json'),
  );
  const items = raw?.plugins ?? [];
  const catalog: CatalogPlugin[] = items.map((p) => {
    const item: CatalogPlugin = { id: pluginId(p.name, marketId), name: p.name, marketplace: marketId };
    if (p.description) item.description = p.description;
    if (p.version) item.version = p.version;
    const author = authorName(p.author);
    if (author) item.author = author;
    if (p.category) item.category = p.category;
    if (p.homepage) item.homepage = p.homepage;
    if (p.tags?.length) item.tags = p.tags;
    const resolved = resolveCatalogSource(p.source, location);
    if (resolved.path) item.sourcePath = resolved.path;
    if (resolved.label) item.source = resolved.label;
    return item;
  });
  // Codex cache dirs are installable even without a catalog file: the plugin
  // directory itself is the source.
  if (catalog.length === 0) {
    for (const name of await listDirNames(location)) {
      const version = await latestVersionDir(path.join(location, name));
      const id = pluginId(name, marketId);
      if (catalog.some((c) => c.id === id)) continue;
      catalog.push({
        id,
        name,
        marketplace: marketId,
        ...(version ? { version } : {}),
        sourcePath: path.join(location, name),
      });
    }
  }
  return catalog;
}

/** Codex nests `<market>/<plugin>/<version>`; the last dir is the newest install. */
async function latestVersionDir(pluginDir: string): Promise<string | undefined> {
  const versions = await listDirNames(pluginDir);
  return versions[versions.length - 1];
}

function safeSplit(id: string): { name: string; marketplace: string } {
  try {
    return splitPluginId(id);
  } catch {
    return { name: id, marketplace: '' };
  }
}
