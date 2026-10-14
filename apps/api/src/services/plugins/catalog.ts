/**
 * Shared marketplace-catalog handling.
 *
 * Claude Code and Codex both ship a `marketplace.json` with the same shape, and
 * both write `source` as either a path inside the marketplace checkout or a
 * remote spec. Only the path form can be installed from disk, so normalizing it
 * in one place keeps the two adapters honest about what they can offer.
 */

import path from 'node:path';
import { isInside } from './fsUtils.js';

export type CatalogSource = string | { source?: string; url?: string; repo?: string; ref?: string };

export interface CatalogPluginEntry {
  name: string;
  description?: string;
  version?: string;
  author?: { name?: string } | string;
  source?: CatalogSource;
  category?: string;
  homepage?: string;
  tags?: string[];
}

export interface CatalogFile {
  name?: string;
  description?: string;
  plugins?: CatalogPluginEntry[];
}

/** `path` = installable from disk; `label` = what to show the operator. */
export function resolveCatalogSource(
  spec: CatalogSource | undefined,
  marketplaceRoot: string,
): { path?: string; label?: string } {
  if (!spec) return {};
  if (typeof spec !== 'string') {
    if (spec.url) return { label: spec.url };
    if (spec.repo) return { label: `github:${spec.repo}${spec.ref ? `#${spec.ref}` : ''}` };
    return { label: spec.source ?? 'remote' };
  }
  const resolved = path.resolve(marketplaceRoot, spec);
  // A marketplace may point at a subdir of itself; refuse to follow anything
  // that escapes the checkout, e.g. "../../etc".
  return isInside(marketplaceRoot, resolved) ? { path: resolved, label: spec } : { label: spec };
}

export function authorName(author: CatalogPluginEntry['author']): string | undefined {
  if (!author) return undefined;
  return typeof author === 'string' ? author : author.name;
}
