/**
 * Shared types for the gateway-control-panel backend.
 *
 * IMPORTANT: `apps/web/src/tabs/TabHost.tsx` MUST NOT import this file
 * (it must remain agnostic of the gateway schema). The decoupling invariant
 * is enforced by `apps/web/test/unit/tabhost.import-boundary.test.ts`.
 */

export interface Gateway {
  /** Unique id, used as the URL path segment and the in-memory PID map key. */
  id: string;
  /** Human-readable label. */
  name: string;
  /** Informational; not used by the backend. */
  port?: number;
  /** Shell command string. Foreground, non-daemonizing. */
  startCommand: string;
  /** Shell command string. Optional; SIGTERM-by-PID is the fallback. */
  stopCommand?: string;
  /** Optional HTTP endpoint probed every pollingCadenceMs. */
  healthUrl?: string;
}

export interface HealthResult {
  ok: boolean;
  httpCode?: number;
  error?: string;
  /** ISO 8601 timestamp. */
  at: string;
}

export interface GatewayStatus {
  gateway: Gateway;
  /** True iff the supervisor has a live PID (verified at read time). */
  running: boolean;
  pid?: number;
  health?: HealthResult;
  lastError?: string;
}

export interface ServerConfig {
  bind: '127.0.0.1' | '0.0.0.0';
  port: number;
  pollingCadenceMs: number;
  chokidarDebounceMs: number;
  healthProbeTimeoutMs: number;
}

export const DEFAULT_SERVER_CONFIG: ServerConfig = {
  bind: '127.0.0.1',
  port: 8787,
  pollingCadenceMs: 3000,
  chokidarDebounceMs: 250,
  healthProbeTimeoutMs: 2000,
};
