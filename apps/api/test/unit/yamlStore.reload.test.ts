import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { YamlStore } from '../../src/services/yamlStore.js';

let tmpDir: string;
let filePath: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gcp-yamlreload-'));
  filePath = path.join(tmpDir, 'gateways.yaml');
  await fs.writeFile(filePath, '- id: g1\n  name: A\n  startCommand: x\n', 'utf8');
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('YamlStore reload on external edit', () => {
  it('A2: external edit triggers reload within ≤1s', async () => {
    const store = new YamlStore(filePath);
    await store.load();
    expect(store.list()).toHaveLength(1);

    let reloadedCount = -1;
    const ready = new Promise<void>((resolve) => {
      store.watch(
        (gateways) => {
          reloadedCount = gateways.length;
          resolve();
        },
        100,
      );
    });
    // Give chokidar a moment to attach
    await new Promise((r) => setTimeout(r, 200));

    const start = Date.now();
    await fs.writeFile(
      filePath,
      '- id: g1\n  name: A\n  startCommand: x\n- id: g2\n  name: B\n  startCommand: y\n',
      'utf8',
    );

    await Promise.race([
      ready,
      new Promise<void>((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000)),
    ]);

    const elapsed = Date.now() - start;
    expect(reloadedCount).toBe(2);
    expect(elapsed).toBeLessThan(3000);

    await store.close();
  });
});
