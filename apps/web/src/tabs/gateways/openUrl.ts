import type { Gateway } from '../../types.js';

/**
 * Resolve the page to open for a gateway.
 * Preference: launchOpenUrl (process token) → explicit openUrl → healthUrl origin → localhost:port.
 */
export function resolveOpenUrl(
  gateway: Pick<Gateway, 'openUrl' | 'healthUrl' | 'port'>,
  launchOpenUrl?: string,
): string | undefined {
  if (launchOpenUrl) return launchOpenUrl;
  if (gateway.openUrl) return gateway.openUrl;
  if (gateway.healthUrl) {
    try {
      return new URL(gateway.healthUrl).origin;
    } catch {
      return gateway.healthUrl;
    }
  }
  if (gateway.port !== undefined) return `http://127.0.0.1:${gateway.port}`;
  return undefined;
}
