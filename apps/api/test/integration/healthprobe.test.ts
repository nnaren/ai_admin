import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { HealthProbe } from '../../src/services/healthProbe.js';

let server: http.Server | null = null;

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = null;
  }
});

function startFakeServer(status: number): Promise<number> {
  return new Promise((resolve) => {
    server = http.createServer((_req, res) => {
      res.statusCode = status;
      res.end('ok');
    });
    server.listen(0, '127.0.0.1', () => {
      const port = (server!.address() as AddressInfo).port;
      resolve(port);
    });
  });
}

describe('HealthProbe', () => {
  it('refreshes the cached result immediately on demand', async () => {
    const port = await startFakeServer(200);
    const probe = new HealthProbe(60_000, 2000);
    const gateway = {
      id: 'refresh',
      name: 'refresh',
      startCommand: 'x',
      healthUrl: `http://127.0.0.1:${port}/`,
    };

    const result = await probe.checkNow(gateway);

    expect(result?.ok).toBe(true);
    expect(probe.get(gateway.id)).toEqual(result);
    probe.shutdown();
  });

  it('G1: returns ok=true with HTTP code when endpoint reachable', async () => {
    const port = await startFakeServer(200);
    const probe = new HealthProbe(1000, 2000);
    probe.probe({ id: 'h1', name: 'h', startCommand: 'x', healthUrl: `http://127.0.0.1:${port}/` });
    // Initial probe is async; wait up to 1s for cache to populate.
    for (let i = 0; i < 20; i++) {
      if (probe.get('h1')) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    const result = probe.get('h1');
    expect(result?.ok).toBe(true);
    expect(result?.httpCode).toBe(200);
    probe.shutdown();
  });

  it('G2: returns ok=false with error when endpoint refuses connection', async () => {
    const probe = new HealthProbe(1000, 2000);
    probe.probe({
      id: 'h2',
      name: 'h',
      startCommand: 'x',
      healthUrl: 'http://127.0.0.1:1/never', // port 1 refuses
    });
    for (let i = 0; i < 25; i++) {
      const r = probe.get('h2');
      if (r && !r.ok) {
        expect(r.error).toBeDefined();
        probe.shutdown();
        return;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('probe never returned failure');
  });
});
