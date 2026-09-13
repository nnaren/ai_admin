import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Supervisor } from '../../src/services/supervisor.js';
import type { Gateway } from '../../src/types.js';

let server: http.Server | null = null;

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = null;
  }
});

function listen(): Promise<number> {
  return new Promise((resolve) => {
    server = http.createServer((_req, res) => {
      res.statusCode = 200;
      res.end('ok');
    });
    server.listen(0, '127.0.0.1', () => {
      resolve((server!.address() as AddressInfo).port);
    });
  });
}

describe('Supervisor adopt existing listener', () => {
  it('start attaches to a process already listening on the gateway port', async () => {
    const port = await listen();
    const sup = new Supervisor();
    const gw: Gateway = {
      id: 'adopt',
      name: 'adopt',
      port,
      startCommand: 'exit 1',
      healthUrl: `http://127.0.0.1:${port}/`,
    };
    try {
      const { pid } = await sup.start(gw);
      expect(pid).toBeGreaterThan(0);
      expect(sup.getLivePid('adopt')).toBe(pid);
    } finally {
      // Do not stop — that would kill the test HTTP server via adopted pid.
      await sup.shutdown();
      expect(sup.getLivePid('adopt')).toBeUndefined();
    }
  });
});
