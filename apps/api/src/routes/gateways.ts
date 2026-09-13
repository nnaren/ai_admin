import type { FastifyInstance } from 'fastify';
import type { YamlStore } from '../services/yamlStore.js';
import type { Supervisor } from '../services/supervisor.js';
import type { HealthProbe } from '../services/healthProbe.js';
import type { Gateway, GatewayStatus } from '../types.js';

/**
 * REST routes for gateways. Backend is sole writer (R9).
 *
 * Spec F7 endpoints (this MVP):
 *   GET    /api/gateways         list with live status merged in
 *   POST   /api/gateways         add a new gateway entry
 *   PUT    /api/gateways/:id     edit an existing entry
 *   DELETE /api/gateways/:id     remove an entry
 *   POST   /api/gateways/:id/start
 *   POST   /api/gateways/:id/stop
 *   GET    /api/health           liveness
 */
export function registerGatewayRoutes(
  app: FastifyInstance,
  store: YamlStore,
  supervisor: Supervisor,
  probe: HealthProbe,
): void {
  app.get('/api/health', async () => ({ ok: true }));

  app.get('/api/gateways', async (): Promise<GatewayStatus[]> => {
    const entries = store.list();
    return Promise.all(entries.map((gateway) => buildStatus(gateway, supervisor, probe)));
  });

  app.post<{ Body: Gateway }>('/api/gateways', async (req, reply) => {
    const gw = req.body;
    if (!isValidGateway(gw)) {
      return reply.code(400).send({ error: 'invalid gateway', gateway: gw });
    }
    try {
      await store.add(gw);
      probe.probe(gw);
      return reply.code(201).send({ gateway: gw });
    } catch (err) {
      const msg = (err as Error).message;
      return reply.code(409).send({ error: msg });
    }
  });

  app.put<{ Params: { id: string }; Body: Partial<Gateway> }>(
    '/api/gateways/:id',
    async (req, reply) => {
      const { id } = req.params;
      const patch = req.body;
      try {
        await store.update(id, patch);
        const updated = store.get(id);
        if (updated) probe.probe(updated);
        return reply.send({ gateway: updated });
      } catch (err) {
        const msg = (err as Error).message;
        return reply.code(404).send({ error: msg });
      }
    },
  );

  app.delete<{ Params: { id: string } }>('/api/gateways/:id', async (req, reply) => {
    const { id } = req.params;
    try {
      probe.unprobe(id);
      await store.remove(id);
      return reply.code(204).send();
    } catch (err) {
      return reply.code(404).send({ error: (err as Error).message });
    }
  });

  app.post<{ Params: { id: string } }>('/api/gateways/:id/start', async (req, reply) => {
    const { id } = req.params;
    const gateway = store.get(id);
    if (!gateway) return reply.code(404).send({ error: `gateway ${id} not found` });
    try {
      const { pid } = await supervisor.start(gateway);
      probe.probe(gateway);
      return reply.send({ running: true, pid });
    } catch (err) {
      const e = err as Error & { code?: string; pid?: number };
      if (e.code?.startsWith('already-running')) {
        return reply.code(409).send({ error: e.code, pid: e.pid });
      }
      return reply.code(500).send({ error: e.message });
    }
  });

  app.post<{ Params: { id: string } }>('/api/gateways/:id/stop', async (req, reply) => {
    const { id } = req.params;
    const gateway = store.get(id);
    if (!gateway) return reply.code(404).send({ error: `gateway ${id} not found` });
    try {
      await supervisor.stop(gateway);
      probe.invalidate(id);
      return reply.send({ running: false });
    } catch (err) {
      return reply.code(500).send({ error: (err as Error).message });
    }
  });
}

async function buildStatus(
  gateway: Gateway,
  supervisor: Supervisor,
  probe: HealthProbe,
): Promise<GatewayStatus> {
  const health = probe.get(gateway.id);
  const pid = (await supervisor.reconcile(gateway)) ?? supervisor.getLivePid(gateway.id);
  const reachable = health?.ok === true;
  const running = pid !== undefined || reachable;
  const lastError = running ? undefined : supervisor.getLastError(gateway.id);
  const status: GatewayStatus = {
    gateway,
    running,
  };
  if (pid !== undefined) status.pid = pid;
  if (health) status.health = health;
  if (lastError) status.lastError = lastError;
  return status;
}

function isValidGateway(g: unknown): g is Gateway {
  if (typeof g !== 'object' || g === null) return false;
  const obj = g as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    obj.id.length > 0 &&
    typeof obj.name === 'string' &&
    typeof obj.startCommand === 'string'
  );
}
