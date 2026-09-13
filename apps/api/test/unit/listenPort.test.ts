import { describe, it, expect } from 'vitest';
import { listenPort } from '../../src/services/listenPort.js';

describe('listenPort', () => {
  it('prefers the explicit port field', () => {
    expect(listenPort({ port: 3080, healthUrl: 'http://127.0.0.1:9/health' })).toBe(3080);
  });

  it('falls back to healthUrl then openUrl', () => {
    expect(listenPort({ healthUrl: 'http://127.0.0.1:3080/' })).toBe(3080);
    expect(listenPort({ openUrl: 'http://127.0.0.1:9000/' })).toBe(9000);
  });
});
