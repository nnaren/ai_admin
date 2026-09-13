import { describe, it, expect } from 'vitest';
import { resolveOpenUrl } from '../../src/tabs/gateways/openUrl.js';

describe('resolveOpenUrl', () => {
  it('prefers explicit openUrl', () => {
    expect(
      resolveOpenUrl({
        openUrl: 'http://127.0.0.1:3080/',
        healthUrl: 'http://127.0.0.1:3080/health',
        port: 9,
      }),
    ).toBe('http://127.0.0.1:3080/');
  });

  it('uses healthUrl origin when openUrl is absent', () => {
    expect(resolveOpenUrl({ healthUrl: 'http://127.0.0.1:9000/health' })).toBe(
      'http://127.0.0.1:9000',
    );
  });

  it('falls back to localhost port', () => {
    expect(resolveOpenUrl({ port: 3080 })).toBe('http://127.0.0.1:3080');
  });

  it('returns undefined when nothing is configured', () => {
    expect(resolveOpenUrl({})).toBeUndefined();
  });
});
