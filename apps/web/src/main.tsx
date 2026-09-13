import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { registerTab } from './tabs/registry.js';
import { GatewaysTab } from './tabs/gateways/GatewaysTab.js';
import { UsageTab } from './tabs/usage/UsageTab.js';
import { applyThemePreference, readThemePreference } from './theme.js';
import './styles.css';

applyThemePreference(readThemePreference());

registerTab({
  id: 'gateways',
  path: '/gateways',
  label: 'Gateways',
  component: GatewaysTab,
});
registerTab({
  id: 'usage',
  path: '/usage',
  label: '用量',
  component: UsageTab,
});

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
