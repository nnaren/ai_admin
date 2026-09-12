import type { Gateway, HealthResult } from '../types.js';

/**
 * Scheduled HTTP GET against gateway.healthUrl.
 *
 * Spec F4: G1/G2 — last probe result exposed via /api/gateways merge.
 * 2s default timeout.
 */
export class HealthProbe {
  private readonly cache = new Map<string, HealthResult>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly intervalMs: number;
  private readonly timeoutMs: number;

  constructor(intervalMs: number, timeoutMs: number) {
    this.intervalMs = intervalMs;
    this.timeoutMs = timeoutMs;
  }

  /** Begin probing a gateway. Idempotent. */
  probe(gateway: Gateway): void {
    if (!gateway.healthUrl) return;
    if (this.timers.has(gateway.id)) return;
    const tick = async () => {
      const result = await this.fetchOnce(gateway.healthUrl!);
      this.cache.set(gateway.id, result);
    };
    void tick();
    const timer = setInterval(() => void tick(), this.intervalMs);
    this.timers.set(gateway.id, timer);
  }

  /** Stop probing a gateway id (and clear its cache entry). */
  unprobe(gatewayId: string): void {
    const t = this.timers.get(gatewayId);
    if (t) {
      clearInterval(t);
      this.timers.delete(gatewayId);
    }
    this.cache.delete(gatewayId);
  }

  /** Clear cache for a gateway id without stopping the probe (e.g. on PID death). */
  invalidate(gatewayId: string): void {
    this.cache.delete(gatewayId);
  }

  /** Last probe result, if any. */
  get(gatewayId: string): HealthResult | undefined {
    return this.cache.get(gatewayId);
  }

  /** Stop everything (used on server shutdown). */
  shutdown(): void {
    for (const [id, t] of this.timers.entries()) {
      clearInterval(t);
      this.timers.delete(id);
    }
  }

  private async fetchOnce(url: string): Promise<HealthResult> {
    const at = new Date().toISOString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const resp = await fetch(url, { method: 'GET', signal: controller.signal });
      return {
        ok: resp.ok,
        httpCode: resp.status,
        at,
      };
    } catch (err) {
      const e = err as Error;
      return {
        ok: false,
        error: e.name === 'AbortError' ? 'timeout' : e.message,
        at,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
