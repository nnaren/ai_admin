# gateway-control-panel

A **local development dashboard** for self-managed AI gateway processes.

- Single-operator (you), localhost-first (`127.0.0.1:8787` by default), YAML-authoritative.
- One tab today (`gateways`); a generic tab host lets additional tabs be added without touching the host.
- No auth, no cloud, no Docker. Just Node + pnpm + Vite + Fastify.

---

## Threat model

This panel is built for **a single trusted operator on a local machine**. There is **no authentication**. By default the backend binds to `127.0.0.1` only — it is unreachable from the network. If you opt into LAN mode by setting `bind: 0.0.0.0` in `config/server.yaml`, **anyone on your LAN can see and trigger start/stop on every gateway**. This is an explicit user-accepted risk; do not enable LAN mode unless you accept it.

`startCommand` and `stopCommand` are expected to be **foreground, non-daemonizing** commands. The supervisor tracks the immediate child PID; commands like `nohup ... &`, `setsid ...`, or `bash -c 'sleep 60 &'` will report `running=false` on the panel because the immediate child has already exited. See the test suite (`supervisor.failures.test.ts`) for the explicit regression case.

---

## Quick start

```bash
pnpm install
pnpm dev
```

Then open `http://localhost:5173`.

The backend listens on `127.0.0.1:8787`; the Vite dev server proxies `/api/*` to it.

A sample `config/gateways.yaml` is provided. Edit it freely — the panel picks up changes within ~250 ms.

---

## YAML schema (`config/gateways.yaml`)

```yaml
- id: my-gateway                # required, unique
  name: My Gateway              # human-readable label
  port: 9000                    # optional; informational
  startCommand: "/bin/sh -c 'exec sleep 300'"   # required
  stopCommand: "/bin/sh -c 'kill -TERM $PID'"  # optional; if missing, SIGTERM by PID is the fallback
  healthUrl: "http://127.0.0.1:9000/health"    # optional; probed every 3s
  openUrl: "http://127.0.0.1:9000/"            # optional; Open button target when running
  color: blue                                  # optional; blue|green|amber|rose|violet|cyan|slate
```

`config/server.yaml`:

```yaml
bind: 127.0.0.1   # or 0.0.0.0 for LAN opt-in
port: 8787
pollingCadenceMs: 300000  # health probe interval (5 min)
chokidarDebounceMs: 250
healthProbeTimeoutMs: 2000
```

---

## Adding a new tab (extension contract)

The `TabHost` is intentionally **generic**: it does not import the gateways schema. To add a new tab:

1. Create a React component module under `apps/web/src/tabs/<your-tab>/`.
2. Add a registry entry in `apps/web/src/tabs/registry.ts`:

```ts
import { MyTab } from './my-tab/MyTab';

export const tabs: TabDef[] = [
  { id: 'my-tab', path: '/my-tab', label: 'My Tab', component: MyTab },
  { id: 'gateways', path: '/gateways', label: 'Gateways', component: GatewaysTab },
];
```

3. Done. **No changes to `TabHost.tsx`.** This invariant is enforced by `apps/web/test/unit/tabhost.import-boundary.test.ts` and `registry.extension.test.ts`.

---

## Scripts

| Command | Purpose |
|---|---|
| `pnpm install` | Install all workspace deps |
| `pnpm dev` | Run both apps (Vite + Fastify) in parallel |
| `pnpm typecheck` | TypeScript across both apps |
| `pnpm lint` | ESLint across both apps |
| `pnpm test` | All unit + integration tests |
| `pnpm test:integration` | Backend integration tests |
| `pnpm test:e2e` | Playwright UI tests |

---

## Out of scope (deferred, not excluded)

Auth, multi-node, log streaming, auto-restart, Docker/systemd, mobile responsive. See spec round 7.
