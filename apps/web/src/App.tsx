import { TabHost } from './tabs/TabHost.js';
import { ThemeToggle } from './ThemeToggle.js';

export function App(): JSX.Element {
  return (
    <div className="gcp-app">
      <header className="gcp-header">
        <div className="gcp-brand">
          <img src="/ai-control-panel.png" alt="" aria-hidden="true" />
          <h1>AI控制面板</h1>
        </div>
        <ThemeToggle />
      </header>
      <TabHost />
    </div>
  );
}
