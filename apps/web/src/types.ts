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
  /** One-shot browser URL from process output (e.g. dsh web `?token=`). */
  launchOpenUrl?: string;
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
  /** ISO time this payload was produced — the toolbar renders its age. */
  refreshedAt?: string;
  todayTokens?: number;
  todayCost?: number;
  currency?: string;
  balance?: number;
  balances?: UsageBalance[];
  windows?: UsageWindow[];
  spend?: UsageSpendMap;
}

/* ------------------------------------------------------------------ *
 * Plugins tab (mirror of apps/api/src/types.ts plugin section)
 * ------------------------------------------------------------------ */

export type PluginToolId = 'claudecode' | 'codex' | 'deepseek';
export type PluginScope = 'user' | 'project';

/** One installed plugin. `id` is `<name>@<marketplace>`. */
export interface PluginEntry {
  id: string;
  name: string;
  marketplace: string;
  version?: string;
  description?: string;
  enabled: boolean;
  installedAt?: string;
  updatedAt?: string;
  path?: string;
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

export interface CatalogPlugin {
  id: string;
  name: string;
  marketplace: string;
  description?: string;
  version?: string;
  author?: string;
  category?: string;
  homepage?: string;
  tags?: string[];
  sourcePath?: string;
  source?: string;
}

/** Everything one tool exposes under one scope root. */
export interface PluginScopeView {
  scope: PluginScope;
  root: string;
  present: boolean;
  plugins: PluginEntry[];
  marketplaces: MarketplaceEntry[];
  catalog: CatalogPlugin[];
  canInstall: boolean;
  note?: string;
  lastError?: string;
}

export interface PluginToolView {
  id: PluginToolId;
  label: string;
  color: string;
  userScope: PluginScopeView;
}

export interface PluginProject {
  id: string;
  name: string;
  path: string;
  addedAt?: string;
}

export interface PluginProjectView extends PluginProject {
  scopes: Partial<Record<PluginToolId, PluginScopeView>>;
}

/** One directory offered by the project path picker. */
export interface BrowseDir {
  name: string;
  path: string;
}

/** Result of `GET /api/plugins/browse` — a directory and its subdirectories. */
export interface BrowseResult {
  path: string;
  parent: string | null;
  /** True when this is the user's home directory. */
  home: boolean;
  dirs: BrowseDir[];
  error?: string;
  truncated?: boolean;
}

export interface PluginOverview {
  refreshedAt: string;
  home: string;
  tools: PluginToolView[];
  projects: PluginProjectView[];
}
