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
  /** Large background label rendered on the card. */
  watermark?: string;
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
  /** One-shot browser URL from process output (e.g. dsh web `?token=`). */
  launchOpenUrl?: string;
}

export interface ServerConfig {
  bind: '127.0.0.1' | '0.0.0.0';
  port: number;
  pollingCadenceMs: number;
  chokidarDebounceMs: number;
  healthProbeTimeoutMs: number;
}

export type UsageKind = 'package' | 'api';
export type UsageVendor = string;
export type UsageRegion = 'cn' | 'global';
export type CredentialStatus = 'valid' | 'expired' | 'error';

/** Consumption over one time dimension. `since` = when the opening balance was recorded. */
export interface UsageSpend {
  currency: string;
  amount: number;
  since: string;
}

/** Consumption keyed by every selectable time dimension; `null` = not on record yet. */
export type UsageSpendMap = Record<
  'today' | 'yesterday' | 'last7d' | 'last30d' | 'thisMonth' | 'lastMonth',
  UsageSpend | null
>;

export interface UsageWindow {
  id: string;
  label: string;
  /** ISO 8601 timestamp when this window resets. */
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

/** Persisted model account. `apiKey` never leaves the backend. */
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

/** Public usage card payload. */
export interface UsageProvider {
  id: string;
  provider: UsageVendor;
  watermark?: string;
  region?: UsageRegion;
  kind: UsageKind;
  color?: string;
  usageUrl?: string;
  hasKey: boolean;
  credentialStatus?: CredentialStatus;
  lastError?: string;
  /** ISO time this payload was produced — the toolbar renders its age. */
  refreshedAt?: string;
  todayTokens?: number;
  /** Shorthand for `spend.today`; kept for older card code. */
  todayCost?: number;
  currency?: string;
  balance?: number;
  balances?: UsageBalance[];
  windows?: UsageWindow[];
  /** Consumption per selectable time dimension. Absent when the account has no balances. */
  spend?: UsageSpendMap;
}

/* ------------------------------------------------------------------ *
 * Plugins tab
 * ------------------------------------------------------------------ */

export type PluginToolId = 'claudecode' | 'codex' | 'deepseek';
export type PluginScope = 'user' | 'project';

/** One installed plugin. `id` is `<name>@<marketplace>` — the key every tool uses natively. */
export interface PluginEntry {
  id: string;
  name: string;
  marketplace: string;
  version?: string;
  description?: string;
  enabled: boolean;
  /** ISO time the tool recorded for the install, when it records one. */
  installedAt?: string;
  updatedAt?: string;
  /** Absolute path of the installed plugin directory, when the tool exposes one. */
  path?: string;
  /** Where the plugin came from (git url, npm package, local dir). */
  source?: string;
}

export interface MarketplaceEntry {
  id: string;
  name: string;
  description?: string;
  source?: string;
  installLocation?: string;
  updatedAt?: string;
}

/** A marketplace plugin offered for install, flattened with its marketplace id. */
export interface CatalogPlugin {
  /** `<name>@<marketplace>`. */
  id: string;
  name: string;
  marketplace: string;
  description?: string;
  version?: string;
  author?: string;
  category?: string;
  homepage?: string;
  tags?: string[];
  /** Absolute local directory this plugin would be installed from. */
  sourcePath?: string;
  /** Human-readable origin: a relative path, a git url, or `github:owner/repo`. */
  source?: string;
}

/** Everything one tool exposes under one scope root. */
export interface PluginScopeView {
  scope: PluginScope;
  /** Absolute scan root: the home dir for user scope, the project dir for project scope. */
  root: string;
  /** False when the tool has no directory at this root (e.g. project never ran the tool). */
  present: boolean;
  plugins: PluginEntry[];
  marketplaces: MarketplaceEntry[];
  catalog: CatalogPlugin[];
  /** False for tools whose install path this panel does not drive (deepseek bundles). */
  canInstall: boolean;
  /** Human-readable caveat surfaced in the UI (e.g. install unsupported). */
  note?: string;
  lastError?: string;
}

export interface PluginToolView {
  id: PluginToolId;
  label: string;
  color: string;
  /** The resident user scope. Always present — this is the tab's home view. */
  userScope: PluginScopeView;
}

/** A project registered for project-scope management. Added by absolute path. */
export interface PluginProject {
  id: string;
  name: string;
  path: string;
  addedAt?: string;
}

/** A project plus its per-tool scope views. */
export interface PluginProjectView extends PluginProject {
  scopes: Partial<Record<PluginToolId, PluginScopeView>>;
}

export interface PluginOverview {
  refreshedAt: string;
  /** Home directory the user scope was scanned from. */
  home: string;
  tools: PluginToolView[];
  projects: PluginProjectView[];
}

export const DEFAULT_SERVER_CONFIG: ServerConfig = {
  bind: '127.0.0.1',
  port: 8787,
  pollingCadenceMs: 5 * 60 * 1000,
  chokidarDebounceMs: 250,
  healthProbeTimeoutMs: 2000,
};
