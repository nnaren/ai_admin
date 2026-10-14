import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { registerTab } from './tabs/registry.js';
import { GatewaysTab } from './tabs/gateways/GatewaysTab.js';
import { UsageTab } from './tabs/usage/UsageTab.js';
import { PluginsTab } from './tabs/plugins/PluginsTab.js';
import { applyThemePreference, readThemePreference } from './theme.js';
import './styles.css';

applyThemePreference(readThemePreference());

registerTab({
  id: 'gateways',
  path: '/gateways',
  label: '网关',
  component: GatewaysTab,
});
registerTab({
  id: 'usage',
  path: '/usage',
  label: '用量',
  component: UsageTab,
});
registerTab({
  id: 'plugins',
  path: '/plugins',
  label: '插件',
  component: PluginsTab,
});

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
