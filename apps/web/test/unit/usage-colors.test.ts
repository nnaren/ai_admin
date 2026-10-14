import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const STYLES = path.resolve(__dirname, '../../src/styles.css');

/**
 * The usage card leans on CSS custom properties, so assert the rules themselves:
 * a specificity regression (an element carrying both .value and .gcp-usage-money)
 * silently repaints amounts.
 */
describe('usage card colors', () => {
  it('paints only the number green-bold, leaving the symbol plain', async () => {
    const css = await readFile(STYLES, 'utf8');
    const amount = /\.gcp-money-amount\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(amount).toMatch(/color:\s*var\(--go\)/);
    expect(amount).toMatch(/font-weight:\s*700/);

    const money = /\.gcp-usage-money\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(money).toMatch(/color:\s*var\(--text\)/);
    expect(money).toMatch(/font-weight:\s*400/);
    // Keeps ￥ glued to its number instead of drifting apart in a space-between row.
    expect(money).toMatch(/display:\s*inline-flex/);

    const sign = /\.gcp-money-sign\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(sign).toMatch(/color:\s*var\(--text\)/);
  });

  it('keeps the quota "已用 %" green', async () => {
    const css = await readFile(STYLES, 'utf8');
    const rule = /\.gcp-quota-used\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(rule).toMatch(/color:\s*var\(--go\)/);
  });

  it('does not couple .gcp-usage-money to a green rule anymore', async () => {
    const css = await readFile(STYLES, 'utf8');
    expect(css).not.toMatch(/\.gcp-quota-used\s*,\s*\n\s*\.gcp-usage-money\s*\{/);
  });

  it('labels balance and spend rows with the main text color', async () => {
    const css = await readFile(STYLES, 'utf8');
    for (const selector of ['.gcp-usage-today', '.gcp-usage-spend']) {
      const rule = new RegExp(`${selector.replace('.', '\\.')}\\s*\\{[^}]*\\}`).exec(css)?.[0] ?? '';
      expect(rule).toMatch(/color:\s*var\(--text\)/);
      expect(rule).not.toMatch(/color:\s*var\(--muted\)/);
    }
  });

  it('does not let a .value rule override the amount color', async () => {
    const css = await readFile(STYLES, 'utf8');
    // The money span carries both .value and .gcp-usage-money; a .value rule with
    // higher specificity would win and turn the amount black again.
    expect(css).not.toMatch(/\.gcp-usage-today\s+\.value\s*\{/);
    expect(css).not.toMatch(/\.gcp-usage-money\s+\.value\s*\{/);
  });
});
