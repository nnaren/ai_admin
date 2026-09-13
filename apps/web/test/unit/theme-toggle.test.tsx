import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeToggle } from '../../src/ThemeToggle.js';
import { THEME_STORAGE_KEY } from '../../src/theme.js';

describe('ThemeToggle', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    localStorage.removeItem(THEME_STORAGE_KEY);
  });

  it('starts from the stored preference', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    render(<ThemeToggle />);
    expect(screen.getByTestId('theme-dark')).toHaveAttribute('aria-checked', 'true');
  });

  it('switches theme, writes localStorage, and sets data-theme', () => {
    render(<ThemeToggle />);

    fireEvent.click(screen.getByTestId('theme-light'));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(screen.getByTestId('theme-light')).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByTestId('theme-dark'));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    fireEvent.click(screen.getByTestId('theme-system'));
    expect(document.documentElement.dataset.theme).toBe('system');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
  });
});
