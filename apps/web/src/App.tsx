import { TabHost } from './tabs/TabHost.js';

export function App(): JSX.Element {
  return (
    <div className="gcp-app">
      <header className="gcp-header">
        <h1>gateway-control-panel</h1>
      </header>
      <TabHost />
    </div>
  );
}
