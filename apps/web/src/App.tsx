import { TabHost } from './tabs/TabHost.js';
import { ThemeToggle } from './ThemeToggle.js';

export function App(): JSX.Element {
  return (
    <div className="gcp-app">
      <header className="gcp-header">
        <h1>gateway-control-panel</h1>
        <ThemeToggle />
      </header>
      <TabHost />
    </div>
  );
}
