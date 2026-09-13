/**
 * Web-side mirror of gateway types. Defined here (not imported from apps/api)
 * to preserve the TabHost decoupling invariant.
 *
 * The api/client module performs runtime validation against this shape.
 */

export interface Gateway {
  id: string;
  name: string;
  /** Large background label rendered on the card. */
  watermark?: string;
  port?: number;
  startCommand: string;
  stopCommand?: string;
  healthUrl?: string;
  /** Optional official page. Falls back to healthUrl origin or localhost:port. */
  openUrl?: string;
  /** Card accent: blue | green | amber | rose | violet | cyan | slate. */
  color?: string;
}

export interface HealthResult {
  ok: boolean;
  httpCode?: number;
  error?: string;
  at: string;
}

export interface GatewayStatus {
  gateway: Gateway;
  running: boolean;
  pid?: number;
  health?: HealthResult;
  lastError?: string;
}

export type UsageKind = 'package' | 'api';
export type UsageVendor = string;
export type UsageRegion = 'cn' | 'global';
export type CredentialStatus = 'valid' | 'expired' | 'error';

export interface UsageWindow {
  id: string;
  label: string;
  resetAt: string;
  quotaPercent: number;
  usedPercent: number;
}

export interface UsageBalance {
  currency: string;
  totalBalance: number;
  grantedBalance?: number;
  toppedUpBalance?: number;
}

export interface UsageAccount {
  id: string;
  provider: UsageVendor;
  watermark?: string;
  region?: UsageRegion;
  kind: UsageKind;
  color?: string;
  usageUrl?: string;
  apiKey?: string;
}

export interface UsageProvider {
  id: string;
  provider: UsageVendor;
  watermark?: string;
  region?: UsageRegion;
  kind: UsageKind;
  color?: string;
  usageUrl?: string;
  hasKey?: boolean;
  credentialStatus?: CredentialStatus;
  lastError?: string;
  todayTokens?: number;
  todayCost?: number;
  currency?: string;
  balance?: number;
  balances?: UsageBalance[];
  windows?: UsageWindow[];
}
