import type {
  BrowseResult,
  Gateway,
  GatewayStatus,
  PluginOverview,
  PluginProjectView,
  PluginScope,
  PluginToolId,
  UsageAccount,
  UsageProvider,
} from '../types.js';

const BASE = '/api';

/** Parse a Fastify error body, falling back to the status line. */
async function fail(resp: Response, fallback: string): Promise<never> {
  const err = (await resp.json().catch(() => ({}))) as { error?: string };
  throw new Error(err.error ?? `${fallback}: ${resp.status}`);
}

export async function listGateways(): Promise<GatewayStatus[]> {
  const resp = await fetch(`${BASE}/gateways`);
  if (!resp.ok) throw new Error(`list failed: ${resp.status}`);
  return resp.json() as Promise<GatewayStatus[]>;
}

export async function startGateway(id: string): Promise<{ pid: number }> {
  const resp = await fetch(`${BASE}/gateways/${encodeURIComponent(id)}/start`, { method: 'POST' });
  if (!resp.ok) {
    const err = (await resp.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `start failed: ${resp.status}`);
  }
  return resp.json() as Promise<{ pid: number }>;
}

export async function stopGateway(id: string): Promise<void> {
  const resp = await fetch(`${BASE}/gateways/${encodeURIComponent(id)}/stop`, { method: 'POST' });
  if (!resp.ok) {
    const err = (await resp.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `stop failed: ${resp.status}`);
  }
}

export async function addGateway(gateway: Gateway): Promise<void> {
  const resp = await fetch(`${BASE}/gateways`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(gateway),
  });
  if (!resp.ok) {
    const err = (await resp.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `add failed: ${resp.status}`);
  }
}

export async function updateGateway(id: string, patch: Partial<Gateway>): Promise<void> {
  const resp = await fetch(`${BASE}/gateways/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!resp.ok) {
    const err = (await resp.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `update failed: ${resp.status}`);
  }
}

export async function listUsage(): Promise<UsageProvider[]> {
  const resp = await fetch(`${BASE}/usage`);
  if (!resp.ok) throw new Error(`usage list failed: ${resp.status}`);
  return resp.json() as Promise<UsageProvider[]>;
}

export async function addUsageAccount(account: UsageAccount): Promise<void> {
  const resp = await fetch(`${BASE}/usage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(account),
  });
  if (!resp.ok) {
    const err = (await resp.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `add account failed: ${resp.status}`);
  }
}

export async function updateUsageAccount(id: string, patch: Partial<UsageAccount>): Promise<void> {
  const resp = await fetch(`${BASE}/usage/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!resp.ok) {
    const err = (await resp.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `update account failed: ${resp.status}`);
  }
}

export async function deleteGateway(id: string): Promise<void> {
  const resp = await fetch(`${BASE}/gateways/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!resp.ok) await fail(resp, 'delete failed');
}

/* ----------------------------- plugins tab ----------------------------- */

export async function listPlugins(): Promise<PluginOverview> {
  const resp = await fetch(`${BASE}/plugins`);
  if (!resp.ok) await fail(resp, 'list plugins failed');
  return resp.json() as Promise<PluginOverview>;
}

/** List subdirectories for the project path picker. Omit `path` to start at home. */
export async function browseDirectories(path?: string): Promise<BrowseResult> {
  const query = path ? `?path=${encodeURIComponent(path)}` : '';
  const resp = await fetch(`${BASE}/plugins/browse${query}`);
  if (!resp.ok) await fail(resp, 'browse failed');
  return resp.json() as Promise<BrowseResult>;
}

export async function addPluginProject(path: string): Promise<PluginProjectView> {
  const resp = await fetch(`${BASE}/plugins/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  if (!resp.ok) await fail(resp, 'add project failed');
  const body = (await resp.json()) as { project: PluginProjectView };
  return body.project;
}

export async function removePluginProject(projectId: string): Promise<void> {
  const resp = await fetch(`${BASE}/plugins/projects/${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
  });
  if (!resp.ok) await fail(resp, 'remove project failed');
}

/** `scope` + `projectId` address one tool's view; user scope is the resident one. */
function scopeQuery(scope: PluginScope, projectId?: string): string {
  return scope === 'project' ? `?project=${encodeURIComponent(projectId ?? '')}` : '';
}

export async function setPluginEnabled(
  tool: PluginToolId,
  scope: PluginScope,
  pluginId: string,
  enabled: boolean,
  projectId?: string,
): Promise<void> {
  const action = enabled ? 'activate' : 'deactivate';
  const resp = await fetch(
    `${BASE}/plugins/${tool}/${scope}/${encodeURIComponent(pluginId)}/${action}${scopeQuery(scope, projectId)}`,
    { method: 'POST' },
  );
  if (!resp.ok) await fail(resp, `${action} failed`);
}

export async function installPlugin(
  tool: PluginToolId,
  scope: PluginScope,
  marketplace: string,
  plugin: string,
  projectId?: string,
): Promise<void> {
  const resp = await fetch(`${BASE}/plugins/${tool}/${scope}/install${scopeQuery(scope, projectId)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ marketplace, plugin }),
  });
  if (!resp.ok) await fail(resp, 'install failed');
}

export async function uninstallPlugin(
  tool: PluginToolId,
  scope: PluginScope,
  pluginId: string,
  projectId?: string,
): Promise<void> {
  const resp = await fetch(
    `${BASE}/plugins/${tool}/${scope}/${encodeURIComponent(pluginId)}${scopeQuery(scope, projectId)}`,
    { method: 'DELETE' },
  );
  if (!resp.ok) await fail(resp, 'uninstall failed');
}
