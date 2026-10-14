import { promises as fs } from 'node:fs';
import path from 'node:path';

/** One directory the picker can descend into. */
export interface DirEntry {
  name: string;
  path: string;
}

export interface BrowseResult {
  /** The directory that was listed. */
  path: string;
  /** `..` target, or null at the filesystem root. */
  parent: string | null;
  /** True when the listing is the user's home directory — the natural start. */
  home: boolean;
  dirs: DirEntry[];
  /** Set when the directory exists but could not be read. */
  error?: string;
  truncated?: boolean;
}

/** Keeps a directory with thousands of subdirectories from flooding the picker. */
const MAX_ENTRIES = 500;

/**
 * List the subdirectories of `dir` for the project picker.
 *
 * The panel has no auth and binds to localhost: whoever can reach it can already
 * start gateway processes, so listing directory names is within the same threat
 * model. Only *names and paths of directories* are returned — never file
 * contents — and dotfiles stay hidden.
 *
 * A directory that cannot be read reports `error` instead of throwing: the
 * picker shows "permission denied" in place, rather than an empty folder list
 * that reads like "nothing here".
 */
export async function browseDirectories(input: string | undefined, home: string): Promise<BrowseResult> {
  const target = resolveBrowseTarget(input, home);

  const parent = path.dirname(target) === target ? null : path.dirname(target);
  const base: BrowseResult = { path: target, parent, home: target === home, dirs: [] };

  // Structural type: the shape `readdir(path, {withFileTypes: true})` guarantees,
  // without depending on which Dirent generic the installed @types/node picks.
  let entries: { name: string; isDirectory(): boolean; isSymbolicLink(): boolean }[];
  try {
    entries = await fs.readdir(target, { withFileTypes: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return { ...base, error: `目录不存在：${target}` };
    if (code === 'EACCES' || code === 'EPERM') return { ...base, error: `没有读取权限：${target}` };
    if (code === 'ENOTDIR') return { ...base, error: `不是目录：${target}` };
    return { ...base, error: `无法读取 ${target}：${(err as Error).message}` };
  }

  const dirs = entries
    .filter((e) => (e.isDirectory() || e.isSymbolicLink()) && !e.name.startsWith('.'))
    .map((e) => ({ name: e.name, path: path.join(target, e.name) }))
    .filter((e) => e.name !== 'node_modules') // thousands of dirs nobody wants to click through
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    ...base,
    dirs: dirs.slice(0, MAX_ENTRIES),
    ...(dirs.length > MAX_ENTRIES ? { truncated: true } : {}),
  };
}

/** Empty/omitted → home. `~`-prefixed → home-relative. Everything else is absolute. */
function resolveBrowseTarget(input: string | undefined, home: string): string {
  const raw = (input ?? '').trim();
  if (!raw) return home;
  if (raw === '~') return home;
  if (raw.startsWith('~/')) return path.join(home, raw.slice(2));
  return path.resolve(raw);
}

/** The directories offered as quick picks before the user browses. */
export function defaultStartDirs(home: string): DirEntry[] {
  return [
    { name: '主目录', path: home },
    { name: '桌面', path: path.join(home, 'Desktop') },
    { name: '文稿', path: path.join(home, 'Documents') },
    { name: '代码', path: path.join(home, 'code') },
    { name: 'Code', path: path.join(home, 'Code') },
    { name: 'CODE', path: path.join(home, 'CODE') },
  ].filter((entry, index, all) => all.findIndex((e) => e.path === entry.path) === index);
}
