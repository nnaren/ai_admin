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

Then open `http://127.0.0.1:8081`.

The backend listens on `127.0.0.1:8787`; the Vite dev server proxies `/api/*` to it.

A sample `config/gateways.yaml` is provided. Edit it freely — the panel picks up changes within ~250 ms.

---

## YAML schema (`config/gateways.yaml`)

```yaml
- id: my-gateway                # required, unique
  name: My Gateway              # human-readable label
  watermark: MY GATEWAY         # optional; large card background label
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

## Usage tab (`/usage`)

Accounts live in `apps/api/config/usage.yaml` (template: `config/usage.yaml.example`). `apiKey` is stored there and **never** returned to the browser — `/api/usage` only exposes `hasKey`.

**DeepSeek (`kind: api`)** — the panel reads `GET https://api.deepseek.com/user/balance` on every `GET /api/usage`. That endpoint is the *only* balance data the public API key can reach: DeepSeek publishes no per-day token or cost endpoint (`/user/usage`, `/user/statistics`, … all 404), and the dashboard endpoints under `platform.deepseek.com/api/v0/usage/*` require a browser session behind AWS WAF.

**Consumption = opening balance − closing balance.** DeepSeek exposes no "usage today" API, so the backend measures it from daily balance records.

1. `DailyCaptureScheduler` appends **one line per local day**, ~1 s after 00:00, to `apps/api/config/usage-history-<accountId>.log` — right next to `usage.yaml`. The file is plain text, one record per day:

   ```
   # account=deepseek currency=CNY
   2026-10-13T00:00:01   5.17
   2026-10-14T00:00:01   3.17
   ```

2. **Append-only, forever.** The backend only ever appends a day that has no line yet. It never truncates, rewrites, prunes or deletes — closing and restarting the service, or crashing mid-write, leaves the whole history intact. A capture also runs on boot, so a panel that was down at 00:00 still gets its line. A failed capture retries after 60 s.
3. Because each day stores only its own balance, every dimension is `opening of the range's first day − opening of the day after its last day`, with the day after today replaced by the live balance:
   - 今天 = 今天的 0 点余额 − 实时余额
   - 昨天 = 昨天的 0 点余额 − 今天的 0 点余额
   - 近 7 天 / 近 30 天 = 起始日 0 点余额 − 实时余额
   - 本月 = 本月 1 号 0 点余额 − 实时余额
   - 上月 = 上月 1 号 0 点余额 − 本月 1 号 0 点余额

   `GET /api/usage` returns the resulting `spend` map; `null` means the range's opening day has no record yet.
4. The card's 「消费金额」 row switches dimension locally — no refetch. `since` carries the opening record's timestamp and shows up in the row's tooltip.
5. `todayTokens` stays unset — token counts are not available from the official API. Topping up mid-period makes the amount go negative; that is the honest arithmetic, not a bug.

The Usage tab auto-refreshes every 5 minutes on the absolute grid (…:00:10) using the refresh button's code path, and shows the age of the last refresh next to the button.

Pass `snapshot: false` to `boot()` in tests — the scheduler would otherwise call real provider APIs with the real `config/usage.yaml`.

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
