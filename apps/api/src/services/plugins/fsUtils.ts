/**
 * Filesystem helpers for the plugins tab.
 *
 * Every tool keeps its plugin state in a hand-editable config file that the tool
 * itself owns (Claude Code writes `settings.json`, Codex writes `config.toml`).
 * The panel edits those files in place, so the rules here are deliberately
 * conservative:
 *
 *  - a parse failure is an error, never an empty state — a wrong answer here
 *    would mean rewriting a user's config with a blank slate;
 *  - every write goes to a temp file, backs up the previous content to
 *    `<file>.bak`, and renames into place;
 *  - nothing is ever deleted except through an explicit, validated call.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

/** Raised when a tool's config cannot be understood. Never swallowed silently. */
export class PluginConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PluginConfigError';
  }
}

/** Expand a leading `~` against `home`. Other paths pass through untouched. */
export function expandHome(target: string, home: string): string {
  if (target === '~') return home;
  if (target.startsWith('~/')) return path.join(home, target.slice(2));
  return path.resolve(target);
}

export async function dirExists(target: string): Promise<boolean> {
  try {
    const stat = await fs.stat(target);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Read and parse a JSON file.
 * Missing file → `undefined` (nothing installed yet).
 * Unparseable file → `PluginConfigError`, so the caller reports it instead of
 * treating a broken config as "no plugins".
 */
export async function readJsonFile<T>(file: string): Promise<T | undefined> {
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new PluginConfigError(`cannot read ${file}: ${(err as Error).message}`);
  }
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    throw new PluginConfigError(`${file} is not valid JSON: ${(err as Error).message}`);
  }
}

/** Read a text file; missing → `undefined`. */
export async function readTextFile(file: string): Promise<string | undefined> {
  try {
    return await fs.readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new PluginConfigError(`cannot read ${file}: ${(err as Error).message}`);
  }
}

/**
 * Atomically replace `file`, keeping the previous content at `<file>.bak`.
 * A missing file is created without a backup.
 */
export async function writeTextFileSafe(file: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const previous = await readTextFile(file);
  if (previous !== undefined && previous !== content) {
    await fs.writeFile(`${file}.bak`, previous, 'utf8');
  }
  const tmp = `${file}.tmp`;
  const handle = await fs.open(tmp, 'w');
  try {
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(tmp, file);
}

/** `JSON.stringify` with the 2-space indent these tools already use, plus a trailing newline. */
export function serializeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function writeJsonFileSafe(file: string, value: unknown): Promise<void> {
  await writeTextFileSafe(file, serializeJson(value));
}

/** Immediate subdirectory names, sorted. Missing dir → `[]`. */
export async function listDirNames(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name)
      .sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw new PluginConfigError(`cannot list ${dir}: ${(err as Error).message}`);
  }
}

/** `true` when `child` is `parent` itself or lives inside it. Path-based, no symlink resolution. */
export function isInside(parent: string, child: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Recursively copy a plugin source directory into place.
 * `sourceRoot` bounds the copy: a marketplace entry whose `source` escapes its
 * install location (e.g. `../../etc`) is refused rather than followed.
 */
export async function copyPluginDir(
  sourcePath: string,
  destination: string,
  sourceRoot: string,
): Promise<void> {
  if (!isInside(sourceRoot, sourcePath)) {
    throw new PluginConfigError(
      `refusing to install from ${sourcePath}: outside marketplace root ${sourceRoot}`,
    );
  }
  if (!(await dirExists(sourcePath))) {
    throw new PluginConfigError(`plugin source not found: ${sourcePath}`);
  }
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.rm(destination, { recursive: true, force: true });
  await fs.cp(sourcePath, destination, { recursive: true, dereference: false });
}
