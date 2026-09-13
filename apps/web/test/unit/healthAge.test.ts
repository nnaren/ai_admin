import { describe, it, expect } from 'vitest';
import { formatHealthAge } from '../../src/tabs/gateways/healthAge.js';

const now = Date.parse('2026-09-12T16:00:00.000Z');

describe('formatHealthAge', () => {
  it('says just now for the first few seconds', () => {
    expect(formatHealthAge('2026-09-12T15:59:57.000Z', now)).toBe('just now');
  });

  it('uses seconds then minutes then hours', () => {
    expect(formatHealthAge('2026-09-12T15:59:40.000Z', now)).toBe('20s ago');
    expect(formatHealthAge('2026-09-12T15:57:00.000Z', now)).toBe('3m ago');
    expect(formatHealthAge('2026-09-12T14:00:00.000Z', now)).toBe('2h ago');
  });

  it('does not emit a clock time', () => {
    const text = formatHealthAge('2026-09-12T15:50:00.000Z', now);
    expect(text).toBe('10m ago');
    expect(text).not.toMatch(/\d{1,2}:\d{2}/);
  });
});
