import { describe, it, expect } from 'vitest';
import { resolveGatewayColor } from '../../src/tabs/gateways/colors.js';

describe('resolveGatewayColor', () => {
  it('keeps known colors and defaults unknown values to slate', () => {
    expect(resolveGatewayColor('blue')).toBe('blue');
    expect(resolveGatewayColor('nope')).toBe('slate');
    expect(resolveGatewayColor(undefined)).toBe('slate');
  });
});
