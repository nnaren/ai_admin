import type { Gateway, GatewayStatus } from '../types.js';

const BASE = '/api';

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

export async function deleteGateway(id: string): Promise<void> {
  const resp = await fetch(`${BASE}/gateways/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!resp.ok) {
    const err = (await resp.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `delete failed: ${resp.status}`);
  }
}
