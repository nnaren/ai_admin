import { describe, it, expect } from 'vitest';
import { formatResetIn, usedBarPercent } from '../../src/tabs/usage/formatReset.js';

describe('formatResetIn', () => {
  it('formats hours and minutes until reset', () => {
    const now = Date.parse('2026-09-13T00:49:00+08:00');
    expect(formatResetIn('2026-09-13T04:51:00+08:00', now)).toBe('4小时 2分钟后重置');
  });

  it('formats days and hours when at least one day remains', () => {
    const now = Date.parse('2026-09-13T00:00:00Z');
    expect(formatResetIn('2026-09-15T03:59:00Z', now)).toBe('2天 3小时后重置');
    expect(formatResetIn('2026-09-19T00:59:00Z', now)).toBe('6天后重置');
  });

  it('says the window is about to reset when past', () => {
    expect(formatResetIn('2020-01-01T00:00:00Z', Date.parse('2026-09-13T00:00:00Z'))).toBe('即将重置');
  });
});

describe('usedBarPercent', () => {
  it('maps used percent onto the bar', () => {
    expect(usedBarPercent(0)).toBe(0);
    expect(usedBarPercent(51)).toBe(51);
    expect(usedBarPercent(120)).toBe(100);
  });
});
