import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LaunchOpenUrlStore } from '../../src/services/launchOpenUrlStore.js';

describe('LaunchOpenUrlStore', () => {
  let filePath: string;
  let store: LaunchOpenUrlStore;

  beforeEach(async () => {
    filePath = path.join(
      os.tmpdir(),
      `gcp-launch-test-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
    );
    store = new LaunchOpenUrlStore(filePath);
  });

  afterEach(async () => {
    await fs.unlink(filePath).catch(() => undefined);
  });

  it('persists and reloads a launch URL for the same pid', async () => {
    await store.set('dsh', 42, 'http://127.0.0.1:3080/?token=abc');
    const reloaded = new LaunchOpenUrlStore(filePath);
    expect(await reloaded.get('dsh', 42)).toBe('http://127.0.0.1:3080/?token=abc');
    expect(await reloaded.get('dsh', 99)).toBeUndefined();
  });

  it('clears a stored URL', async () => {
    await store.set('dsh', 42, 'http://127.0.0.1:3080/?token=abc');
    await store.clear('dsh');
    expect(await store.get('dsh', 42)).toBeUndefined();
  });
});
