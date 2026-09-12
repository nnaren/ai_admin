/**
 * Web-side mirror of gateway types. Defined here (not imported from apps/api)
 * to preserve the TabHost decoupling invariant.
 *
 * The api/client module performs runtime validation against this shape.
 */

export interface Gateway {
  id: string;
  name: string;
  port?: number;
  startCommand: string;
  stopCommand?: string;
  healthUrl?: string;
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
