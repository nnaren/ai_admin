import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { registerTab, getTabs, getTab } from '../../src/tabs/registry.js';
import { TabHost } from '../../src/tabs/TabHost.js';
import { StubTab } from '../../src/tabs/stub/StubTab.js';

describe('Tab registry extension contract (E1, E2)', () => {
  it('E2: registering a second tab requires no change to TabHost.tsx', () => {
    registerTab({
      id: 'gateways',
      path: '/gateways',
      label: 'Gateways',
      component: () => <div data-testid="gateways-stub-content">gateways</div>,
    });
    registerTab({
      id: 'stub',
      path: '/stub',
      label: 'Stub',
      component: StubTab,
    });

    const all = getTabs();
    expect(all.length).toBeGreaterThanOrEqual(2);
    expect(getTab('stub')?.id).toBe('stub');

    render(<TabHost />);
    expect(screen.getByTestId('tab-stub')).toBeInTheDocument();
    expect(screen.getByTestId('tab-gateways')).toBeInTheDocument();

    // Click the stub tab to activate its content.
    fireEvent.click(screen.getByTestId('tab-stub'));
    expect(screen.getByTestId('stub-tab')).toBeInTheDocument();
  });

  it('registerTab rejects duplicate id', () => {
    expect(() => {
      registerTab({ id: 'dup-x', path: '/dup', label: 'Dup', component: () => <div /> });
      registerTab({ id: 'dup-x', path: '/dup2', label: 'Dup', component: () => <div /> });
    }).toThrow(/already registered/);
  });
});
