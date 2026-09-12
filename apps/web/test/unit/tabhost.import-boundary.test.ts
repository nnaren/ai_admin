import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const TABHOST = path.resolve(
  process.cwd(),
  'src/tabs/TabHost.tsx',
);

describe('TabHost decoupling invariant (E3)', () => {
  it('TabHost does NOT import gateways schema or business modules', async () => {
    const src = await fs.readFile(TABHOST, 'utf8');
    expect(src).not.toMatch(/from\s+['"][^'"]*gateways[^'"]*['"]/);
    expect(src).not.toMatch(/from\s+['"][^'"]*api\/client[^'"]*['"]/);
    expect(src).not.toMatch(/from\s+['"]\.\.\/types['"]/);
    // The TabHost must only reference the registry module's types.
    const registryImports = src.match(/from\s+['"][^'"]*registry[^'"]*['"]/g);
    expect(registryImports?.length ?? 0).toBeGreaterThan(0);
  });

  it('TabHost file content does not mention "gateways" anywhere except generic tab ids', async () => {
    const src = await fs.readFile(TABHOST, 'utf8');
    // Strip comments + strings + the 'gateways' tab id we know exists (none yet in TabHost, actually).
    const stripped = src
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    expect(stripped.toLowerCase().includes('gateways')).toBe(false);
  });
});
