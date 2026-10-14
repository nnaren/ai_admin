/**
 * DeepSeek Harness plugin adapter.
 *
 * On-disk contract (verified against ~/.dsh):
 *   <root>/.dsh/profiles/<profile>/package.json → { dsh: { profile: { bundles: [...] } } }
 *   <root>/.dsh/profiles/<profile>/cordis.yml        → base entry list (`[]`)
 *   <root>/.dsh/profiles/<profile>/cordis.patch.yml → overlay entry list, the file
 *                                                        the docs say to edit
 *
 * A "plugin" here is a Cordis bundle (an npm package). Installed = present in the
 * composed entry list (base + patch). Enabling/disabling rewrites the patch
 * list, which is exactly the file dsh documents for local edits.
 *
 * Installing means installing an npm bundle into a profile. That needs a package
 * manager and network, and a half-applied install would leave a broken profile,
 * so `canInstall` is false and the UI says so plainly rather than pretending.
 */

import path from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type {
  CatalogPlugin,
  MarketplaceEntry,
  PluginEntry,
  PluginScopeView,
} from '../../types.js';
import { dirExists, listDirNames, PluginConfigError, readTextFile, writeTextFileSafe } from './fsUtils.js';
import type { InstallRequest, PluginAdapter, PluginScopeTarget } from './types.js';

const SCOPE_DIR = '.dsh';
const DEFAULT_PROFILE = 'desktop';
/** Profiles the harness ships with; the desktop one is the common case. */
const KNOWN_PROFILES = ['desktop', 'web'];
const BUNDLES = 'dsh-bundles';

export interface DeepSeekAdapterOptions {
  /** Profile whose entry list is managed. Defaults to `desktop`. */
  profile?: string;
  /** Override the `.dsh` directory (tests). */
  dirName?: string;
}

export function createDeepSeekAdapter(opts: DeepSeekAdapterOptions = {}): PluginAdapter {
  const dirName = opts.dirName ?? SCOPE_DIR;
  const profile = opts.profile ?? DEFAULT_PROFILE;
  const note = 'DeepSeek 插件由 profile bundle 定义，需 pnpm 安装，面板不代为安装。';

  /** Profiles live under the home directory even for project scope. */
  const profilesDir = (home: string): string => path.join(home, dirName, 'profiles');

  /** The profile the panel manages, falling back to whatever the harness has. */
  const activeProfile = async (home: string): Promise<string | undefined> => {
    const available = (await listDirNames(profilesDir(home))).filter((n) =>
      KNOWN_PROFILES.includes(n),
    );
    return available.includes(profile) ? profile : available[0];
  };

  const patchFile = async (target: PluginScopeTarget): Promise<string> => {
    const active = await activeProfile(target.home);
    if (!active) {
      throw new PluginConfigError('找不到 dsh profile 目录，无法写入 cordis.patch.yml');
    }
    return path.join(profilesDir(target.home), active, 'cordis.patch.yml');
  };

  return {
    id: 'deepseek',
    label: 'DeepSeek Harness',
    color: 'blue',
    canInstall: false,
    note,

    toolHome(root: string): string {
      return path.join(root, dirName);
    },

    async scan(target: PluginScopeTarget): Promise<Omit<PluginScopeView, 'scope' | 'root'>> {
      const empty = {
        present: false,
        plugins: [] as PluginEntry[],
        marketplaces: [] as MarketplaceEntry[],
        catalog: [] as CatalogPlugin[],
        canInstall: false,
        note,
      };
      if (!(await dirExists(this.toolHome(target.root)))) return empty;

      const active = await activeProfile(target.home);
      if (!active) return { ...empty, present: true };

      const profileDir = path.join(profilesDir(target.home), active);
      const base = await readEntries(path.join(profileDir, 'cordis.yml'));
      const overlay = await readEntries(path.join(profileDir, 'cordis.patch.yml'));
      const activeEntries = new Set([...base, ...overlay]);
      const bundles = await readBundles(path.join(profileDir, 'package.json'));

      const plugins: PluginEntry[] = [...activeEntries].sort().map((name) => ({
        id: `${name}@${BUNDLES}`,
        name,
        marketplace: BUNDLES,
        enabled: true,
        source: `npm:${name}`,
      }));

      const catalog: CatalogPlugin[] = bundles.map((name) => ({
        id: `${name}@${BUNDLES}`,
        name,
        marketplace: BUNDLES,
      }));

      const marketplaces: MarketplaceEntry[] = [
        {
          id: BUNDLES,
          name: `@deepseek-ai bundles (${active})`,
          description: 'Harness 自带 bundle，定义在 profile 的 package.json。',
          installLocation: profileDir,
        },
      ];

      return { present: true, plugins, marketplaces, catalog, canInstall: false, note };
    },

    async setEnabled(target: PluginScopeTarget, id: string, on: boolean): Promise<void> {
      const file = await patchFile(target);
      const entries = await readEntries(file);
      const at = id.lastIndexOf('@');
      const name = at > 0 ? id.slice(0, at) : id;
      const next = on ? [...new Set([...entries, name])].sort() : entries.filter((e) => e !== name);
      await writeTextFileSafe(file, stringifyYaml(next));
    },

    async install(_target: PluginScopeTarget, _req: InstallRequest): Promise<void> {
      throw new PluginConfigError(note);
    },

    async uninstall(target: PluginScopeTarget, id: string): Promise<void> {
      await this.setEnabled(target, id, false);
    },
  };
}

/** A cordis entry file is a YAML list of bundle names; tolerate `[]`, missing, or junk. */
async function readEntries(file: string): Promise<string[]> {
  const raw = await readTextFile(file);
  if (raw === undefined) return [];
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    throw new PluginConfigError(`${file} is not valid YAML: ${(err as Error).message}`);
  }
  if (parsed === null || parsed === undefined) return [];
  if (!Array.isArray(parsed)) {
    throw new PluginConfigError(`${file} is not a list of plugin entries`);
  }
  return parsed.filter((v): v is string => typeof v === 'string');
}

async function readBundles(packageFile: string): Promise<string[]> {
  const raw = await readTextFile(packageFile);
  if (!raw) return [];
  let parsed: { dsh?: { profile?: { bundles?: unknown } } };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const bundles = parsed.dsh?.profile?.bundles;
  return Array.isArray(bundles) ? bundles.filter((b): b is string => typeof b === 'string') : [];
}
