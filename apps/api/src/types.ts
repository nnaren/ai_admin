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
  /** Optional HTTP endpoint probed every pollingCadenceMs (default 5 min). */
  healthUrl?: string;
  /** Optional official page to open from the card. Falls back to healthUrl origin or port. */
  openUrl?: string;
  /** Card accent color name. */
  color?: string;
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
  /** True if we have a live PID or the last health probe succeeded. */
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

export type UsageKind = 'package' | 'api';
export type UsageVendor = 'minimax';
export type UsageRegion = 'cn' | 'global';
export type CredentialStatus = 'valid' | 'expired' | 'error';

export interface UsageWindow {
  id: string;
  label: string;
  /** ISO 8601 timestamp when this window resets. */
  resetAt: string;
  quotaPercent: number;
  usedPercent: number;
}

/** Persisted model account. `apiKey` never leaves the backend. */
export interface UsageAccount {
  id: string;
  name: string;
  provider: UsageVendor;
  region?: UsageRegion;
  kind: UsageKind;
  color?: string;
  apiKey?: string;
}

/** Public usage card payload. */
export interface UsageProvider {
  id: string;
  name: string;
  provider: UsageVendor;
  region?: UsageRegion;
  kind: UsageKind;
  color?: string;
  hasKey: boolean;
  credentialStatus?: CredentialStatus;
  lastError?: string;
  todayTokens?: number;
  todayCost?: number;
  currency?: string;
  balance?: number;
  windows?: UsageWindow[];
}

export const DEFAULT_SERVER_CONFIG: ServerConfig = {
  bind: '127.0.0.1',
  port: 8787,
  pollingCadenceMs: 5 * 60 * 1000,
  chokidarDebounceMs: 250,
  healthProbeTimeoutMs: 2000,
};
