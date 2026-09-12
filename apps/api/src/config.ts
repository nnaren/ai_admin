import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { DEFAULT_SERVER_CONFIG, type ServerConfig } from './types.js';

/**
 * Load `config/server.yaml` and merge with defaults. If the file is absent,
 * returns DEFAULT_SERVER_CONFIG.
 *
 * Spec F6: bind/port overridable via config; F1: default 127.0.0.1:8787.
 */
export async function loadServerConfig(configPath?: string): Promise<ServerConfig> {
  const target = configPath ?? path.resolve(process.cwd(), 'config', 'server.yaml');
  try {
    const raw = await fs.readFile(target, 'utf8');
    const parsed = parseYaml(raw) as Partial<ServerConfig> | null;
    if (!parsed || typeof parsed !== 'object') {
      return DEFAULT_SERVER_CONFIG;
    }
    return {
      bind: parsed.bind === '0.0.0.0' ? '0.0.0.0' : '127.0.0.1',
      port: typeof parsed.port === 'number' ? parsed.port : DEFAULT_SERVER_CONFIG.port,
      pollingCadenceMs:
        typeof parsed.pollingCadenceMs === 'number'
          ? parsed.pollingCadenceMs
          : DEFAULT_SERVER_CONFIG.pollingCadenceMs,
      chokidarDebounceMs:
        typeof parsed.chokidarDebounceMs === 'number'
          ? parsed.chokidarDebounceMs
          : DEFAULT_SERVER_CONFIG.chokidarDebounceMs,
      healthProbeTimeoutMs:
        typeof parsed.healthProbeTimeoutMs === 'number'
          ? parsed.healthProbeTimeoutMs
          : DEFAULT_SERVER_CONFIG.healthProbeTimeoutMs,
    };
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') {
      return DEFAULT_SERVER_CONFIG;
    }
    throw err;
  }
}
