import Fastify, { type FastifyInstance } from 'fastify';
import path from 'node:path';
import { loadServerConfig } from './config.js';
import { YamlStore } from './services/yamlStore.js';
import { Supervisor } from './services/supervisor.js';
import { HealthProbe } from './services/healthProbe.js';
import { registerGatewayRoutes } from './routes/gateways.js';
import { registerUsageRoutes } from './routes/usage.js';
import { UsageStore } from './services/usageStore.js';
import type { ServerConfig } from './types.js';

export interface BootOptions {
  configPath?: string;
  yamlPath?: string;
  usagePath?: string;
  configOverride?: Partial<ServerConfig>;
}

/**
 * Boot the Fastify backend. Exported for testability.
 *
 * Spec F6: default bind 127.0.0.1:8787; bind/port overridable.
 * R12: EADDRINUSE surfaced verbatim; backend exits non-zero.
 */
export async function boot(opts: BootOptions = {}): Promise<FastifyInstance> {
  const config = await loadServerConfig(opts.configPath);
  const finalConfig: ServerConfig = { ...config, ...(opts.configOverride ?? {}) };

  const yamlPath =
    opts.yamlPath ?? path.resolve(process.cwd(), 'config', 'gateways.yaml');
  const usagePath =
    opts.usagePath ?? path.resolve(process.cwd(), 'config', 'usage.yaml');

  const app = Fastify({ logger: { level: 'info' } });
  const supervisor = new Supervisor();
  const probe = new HealthProbe(finalConfig.pollingCadenceMs, finalConfig.healthProbeTimeoutMs);
  const store = new YamlStore(yamlPath);

  await store.load();
  store.watch(
    (gateways) => {
      // Restart probes for current set, remove probes for absent ids.
      for (const g of gateways) probe.probe(g);
      // (unprobe handled by DELETE / PUT for removed ids.)
    },
    finalConfig.chokidarDebounceMs,
  );

  for (const g of store.list()) probe.probe(g);

  const usageStore = new UsageStore(usagePath);
  await usageStore.load();

  registerGatewayRoutes(app, store, supervisor, probe);
  registerUsageRoutes(app, usageStore);

  app.addHook('onClose', async () => {
    await store.close();
    probe.shutdown();
    await supervisor.shutdown();
  });

  try {
    await app.listen({ host: finalConfig.bind, port: finalConfig.port });
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'EADDRINUSE') {
      // R12: surface verbatim, exit non-zero.
      console.error(`EADDRINUSE: ${finalConfig.bind}:${finalConfig.port} is already in use`);
    }
    throw err;
  }
  return app;
}

// Allow direct execution: `tsx src/server.ts`
if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('server.ts')
) {
  boot().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}
