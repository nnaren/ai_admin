export type ThemePreference = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'gcp-theme';

export function parseThemePreference(raw: string | null): ThemePreference {
  if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  return 'system';
}

export function readThemePreference(storage?: Pick<Storage, 'getItem'>): ThemePreference {
  try {
    const src = storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
    return parseThemePreference(src?.getItem(THEME_STORAGE_KEY) ?? null);
  } catch {
    return 'system';
  }
}

export function writeThemePreference(
  pref: ThemePreference,
  storage?: Pick<Storage, 'setItem'>,
): void {
  try {
    const dest = storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
    dest?.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    /* private mode / quota */
  }
}

export function applyThemePreference(
  pref: ThemePreference,
  root: HTMLElement = document.documentElement,
): void {
  root.dataset.theme = pref;
}

export function resolveTheme(
  pref: ThemePreference,
  system: 'light' | 'dark',
): 'light' | 'dark' {
  return pref === 'system' ? system : pref;
}
