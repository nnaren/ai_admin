export const GATEWAY_COLORS = ['blue', 'green', 'amber', 'rose', 'violet', 'cyan', 'slate'] as const;

export type GatewayColor = (typeof GATEWAY_COLORS)[number];

export function resolveGatewayColor(color?: string): GatewayColor {
  return GATEWAY_COLORS.includes(color as GatewayColor) ? (color as GatewayColor) : 'slate';
}
