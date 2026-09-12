import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { YamlStore } from '../../src/services/yamlStore.js';
import type { Gateway } from '../../src/types.js';

let tmpDir: string;
let filePath: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gcp-yaml-'));
  filePath = path.join(tmpDir, 'gateways.yaml');
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('YamlStore authority', () => {
  it('A1: writes through YAML are the source of truth', async () => {
    const store = new YamlStore(filePath);
    await store.load();
    const gw: Gateway = {
      id: 'g1',
      name: 'Test',
      startCommand: '/bin/sh -c "exec sleep 1"',
    };
    await store.add(gw);
    const onDisk = await fs.readFile(filePath, 'utf8');
    expect(onDisk).toContain('id: g1');
    const reloaded = new YamlStore(filePath);
    await reloaded.load();
    expect(reloaded.get('g1')?.name).toBe('Test');
  });

  it('A1: rejects duplicate id', async () => {
    const store = new YamlStore(filePath);
    await store.load();
    await store.add({ id: 'g1', name: 'A', startCommand: 'x' });
    await expect(
      store.add({ id: 'g1', name: 'B', startCommand: 'y' }),
    ).rejects.toThrow(/already exists/);
  });

  it('A1: update and remove round-trip', async () => {
    const store = new YamlStore(filePath);
    await store.load();
    await store.add({ id: 'g1', name: 'A', startCommand: 'x' });
    await store.update('g1', { name: 'A2' });
    expect(store.get('g1')?.name).toBe('A2');
    await store.remove('g1');
    expect(store.get('g1')).toBeUndefined();
  });

  it('R13: missing file on first run returns empty list without throwing', async () => {
    const store = new YamlStore(path.join(tmpDir, 'does-not-exist.yaml'));
    const list = await store.load();
    expect(list).toEqual([]);
  });

  it('R8: rejects non-array YAML root', async () => {
    await fs.writeFile(filePath, 'not: an array\n', 'utf8');
    const store = new YamlStore(filePath);
    await expect(store.load()).rejects.toThrow(/array/);
  });

  it('R1: atomic write survives concurrent reader', async () => {
    const store = new YamlStore(filePath);
    await store.load();
    await store.add({ id: 'g1', name: 'A', startCommand: 'x' });
    // Concurrent reader while we add more
    const readPromise = fs.readFile(filePath, 'utf8');
    await store.add({ id: 'g2', name: 'B', startCommand: 'y' });
    const before = await readPromise;
    expect(before).toContain('g1');
    expect(before).not.toContain('g2');
  });
});
