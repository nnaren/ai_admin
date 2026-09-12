import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TabHost } from '../../src/tabs/TabHost.js';
import { registerTab } from '../../src/tabs/registry.js';
import { StubTab } from '../../src/tabs/stub/StubTab.js';

describe('E1: TabHost resilience when a tab is removed', () => {
  beforeEach(async () => {
    // Reset registry state by re-importing.
    const { registerTab: rt } = await import('../../src/tabs/registry.js');
    rt({ id: 'stub-only', path: '/stub', label: 'Stub Only', component: StubTab });
  });

  it('renders the host even if no gateways tab is registered', () => {
    render(<TabHost />);
    expect(screen.getByTestId('tab-host')).toBeInTheDocument();
    expect(screen.getByTestId('tab-stub-only')).toBeInTheDocument();
  });
});
