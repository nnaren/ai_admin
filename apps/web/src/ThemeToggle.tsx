import { useEffect, useState } from 'react';
import {
  applyThemePreference,
  readThemePreference,
  writeThemePreference,
  type ThemePreference,
} from './theme.js';

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '暗色' },
  { value: 'system', label: '跟随系统' },
];

export function ThemeToggle(): JSX.Element {
  const [pref, setPref] = useState<ThemePreference>(readThemePreference);

  useEffect(() => {
    applyThemePreference(pref);
    writeThemePreference(pref);
  }, [pref]);

  return (
    <div className="gcp-theme-toggle" role="radiogroup" aria-label="主题">
      {OPTIONS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={pref === value}
          data-testid={`theme-${value}`}
          onClick={() => setPref(value)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
