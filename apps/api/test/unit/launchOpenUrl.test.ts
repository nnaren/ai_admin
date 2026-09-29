import { describe, it, expect } from 'vitest';
import { extractLaunchOpenUrl } from '../../src/services/launchOpenUrl.js';

describe('extractLaunchOpenUrl', () => {
  it('extracts a dsh web token URL', () => {
    const output = [
      'loading plugins…',
      'dsh web: http://127.0.0.1:3080/?token=abc123',
      'dsh web: opening the default browser; pass --no-open to disable',
    ].join('\n');
    expect(extractLaunchOpenUrl(output)).toBe('http://127.0.0.1:3080/?token=abc123');
  });

  it('prefers loopback over LAN URL on the same line', () => {
    const output =
      'dsh web: http://127.0.0.1:3080/?token=local (LAN: http://10.0.0.8:3080/?token=lan)';
    expect(extractLaunchOpenUrl(output)).toBe('http://127.0.0.1:3080/?token=local');
  });

  it('returns undefined when no token URL is present', () => {
    expect(extractLaunchOpenUrl('listening on http://127.0.0.1:3080/')).toBeUndefined();
  });
});
