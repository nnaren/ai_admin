import { afterEach, describe, expect, it } from 'vitest';
import {
  THEME_STORAGE_KEY,
  applyThemePreference,
  parseThemePreference,
  readThemePreference,
  resolveTheme,
  writeThemePreference,
} from '../../src/theme.js';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const store = { ...initial };
  return {
    get length() {
      return Object.keys(store).length;
    },
    clear() {
      for (const key of Object.keys(store)) delete store[key];
    },
    getItem(key: string) {
      return store[key] ?? null;
    },
    key(index: number) {
      return Object.keys(store)[index] ?? null;
    },
    removeItem(key: string) {
      delete store[key];
    },
    setItem(key: string, value: string) {
      store[key] = value;
    },
  };
}

describe('theme preference', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    localStorage.removeItem(THEME_STORAGE_KEY);
  });

  it('parses known values and falls back to system', () => {
    expect(parseThemePreference('light')).toBe('light');
    expect(parseThemePreference('dark')).toBe('dark');
    expect(parseThemePreference('system')).toBe('system');
    expect(parseThemePreference('nope')).toBe('system');
    expect(parseThemePreference(null)).toBe('system');
  });

  it('persists the preference', () => {
    const storage = memoryStorage();
    writeThemePreference('dark', storage);
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(readThemePreference(storage)).toBe('dark');
  });

  it('reads persisted preference from localStorage', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    expect(readThemePreference()).toBe('light');
  });

  it('applies data-theme on the document root', () => {
    applyThemePreference('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    applyThemePreference('system');
    expect(document.documentElement.dataset.theme).toBe('system');
  });

  it('follows the system preference only when set to system', () => {
    expect(resolveTheme('light', 'dark')).toBe('light');
    expect(resolveTheme('dark', 'light')).toBe('dark');
    expect(resolveTheme('system', 'dark')).toBe('dark');
    expect(resolveTheme('system', 'light')).toBe('light');
  });
});
