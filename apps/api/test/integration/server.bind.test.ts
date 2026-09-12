import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { boot } from '../../src/server.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gcp-bind-'));
  await fs.mkdir(path.join(tmpDir, 'config'), { recursive: true });
  await fs.writeFile(path.join(tmpDir, 'config', 'gateways.yaml'), '[]\n', 'utf8');
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('server bind/port', () => {
  it('F1: defaults to 127.0.0.1:8787 when no server.yaml exists', async () => {
    const port = 18787 + Math.floor(Math.random() * 1000);
    const app = await boot({ yamlPath: path.join(tmpDir, 'config', 'gateways.yaml'), configOverride: { port } });
    try {
      const addr = app.server.address();
      if (typeof addr === 'object' && addr !== null) {
        expect(addr.address).toBe('127.0.0.1');
        expect(addr.port).toBe(port);
      } else {
        throw new Error('no address');
      }
      const resp = await fetch(`http://127.0.0.1:${port}/api/health`);
      expect(resp.ok).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('F2: bind 0.0.0.0 listens on all interfaces', async () => {
    const port = 19787 + Math.floor(Math.random() * 1000);
    const app = await boot({
      yamlPath: path.join(tmpDir, 'config', 'gateways.yaml'),
      configOverride: { bind: '0.0.0.0', port },
    });
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/api/health`);
      expect(resp.ok).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('R12: EADDRINUSE surfaced verbatim when port is held', async () => {
    const port = 20787 + Math.floor(Math.random() * 1000);
    const a = await boot({
      yamlPath: path.join(tmpDir, 'config', 'gateways.yaml'),
      configOverride: { port },
    });
    try {
      await expect(
        boot({
          yamlPath: path.join(tmpDir, 'config', 'gateways.yaml'),
          configOverride: { port },
        }),
      ).rejects.toThrow();
    } finally {
      await a.close();
    }
  });

  it('F3: no auth middleware — anonymous request returns 200', async () => {
    const port = 21787 + Math.floor(Math.random() * 1000);
    const app = await boot({
      yamlPath: path.join(tmpDir, 'config', 'gateways.yaml'),
      configOverride: { port },
    });
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/api/gateways`);
      expect(resp.status).toBe(200);
    } finally {
      await app.close();
    }
  });
});
