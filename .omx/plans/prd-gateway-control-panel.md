# PRD — gateway-control-panel

> Planner output for `$ralplan` consensus planning.
> Source spec: `.omx/specs/deep-interview-gateway-control-panel.md` (ambiguity 0.20, at threshold).
> Context snapshot: `.omx/context/gateway-control-panel-20260912T081300Z.md`.

---

## RALPLAN-DR Summary

### Principles (5)
1. **YAML is the only authority.** UI is a projection; backend is the only writer.
2. **Generic tab host must not import gateway schema.** Adding a second tab requires zero changes to the tab host.
3. **Boring, dependency-light local dev story.** No Docker, no cloud, no auth gateway, no plugin runtime. Node + pnpm + Vite + Fastify.
4. **Single-operator threat model.** Trusted user; optimize for ergonomics over defense.
5. **Right-sized for MVP.** Spec in/out scope is binding; deferred items stay deferred.

### Decision Drivers (top 3)
1. **Authoring ergonomics** — operator edits YAML by hand. Round-trips preserve comments and ordering. Debounced reload feels instant.
2. **Process supervision correctness** — start/stop of long-running shell processes is the most failure-prone subsystem. PID tracking, exit-code surfacing, and a SIGTERM-then-SIGKILL fallback are non-negotiable.
3. **Generic extension surface** — tab host is the load-bearing piece of future-proofing. Small, decoupled, provably testable.

### Viable Options (≥2 evaluated per decision; choices justified)

#### D1. Workspace / build topology
- **A — Single-package, dev-proxy.** One `package.json`. Vite proxies `/api` to Fastify on a separate port.
  - Pros: zero workspace tooling; minimal config; one `pnpm install`.
  - Cons: couples web+api concerns; unclear dependency boundaries.
- **B — pnpm workspaces monorepo.** `apps/web`, `apps/api`, root orchestrates with `concurrently`.
  - Pros: clean module boundaries; aligns with "tabs are plugins" mental model; standard pattern.
  - Cons: more initial config; one extra layer of `pnpm-workspace.yaml`.
- **C — Two separate repos.** Not warranted for a single-operator local tool.
- **Choice: B.** Aligned with Driver 1 + Principle 5. One-time cost.

#### D2. Process supervision library
- **A — `child_process.spawn` direct + manual PID tracking.**
  - Pros: no dependency; explicit semantics; easy to reason about.
  - Cons: more code to write (cleanup, exit handling).
- **B — `execa`.**
  - Pros: less code; better error semantics.
  - Cons: extra dependency; some opacity around signals.
- **C — `tree-kill` as fallback terminator (alongside A or B).**
  - Pros: kills process trees on macOS (SIGTERM doesn't propagate to children).
  - Cons: small extra dependency.
- **Choice: A + C.** Spec favors minimal dependencies (Principle 3). PID tracking is simple. `tree-kill` only as fallback.

#### D3. File watch / reload
- **A — `chokidar`.** Battle-tested cross-platform watcher.
  - Pros: handles macOS/Linux quirks; debouncing built-in.
  - Cons: dependency.
- **B — Node `fs.watch`.** Built-in.
  - Pros: no dependency.
  - Cons: known quirks (macOS coalesces, Linux rename events); reinvents debouncing.
- **Choice: A.** Reliability > dependency cost for a load-bearing subsystem.

#### D4. Live update channel (UI ↔ backend)
- **A — Plain HTTP polling (default 3s).**
  - Pros: simplest; stateless client; trivial reasoning.
  - Cons: ~3s lag.
- **B — SSE for push on backend state changes.**
  - Pros: near-instant.
  - Cons: more infra; reconnect logic; backpressure.
- **Choice: A for MVP.** Spec sets 3s default. SSE is a forward-compatible addition; document as deferred.

#### D5. Tab registry
- **A — Plain TypeScript registry.** `Map<id, TabDef>` in a single file; eager imports.
  - Pros: trivial; type-safe at compile time.
  - Cons: rebuild to add a tab (acceptable — `pnpm dev` is HMR-fast).
- **B — Lazy/dynamic import registry.** Code-splitting per tab.
  - Pros: smaller initial bundle.
  - Cons: more complexity for 1-2 tab MVP.
- **Choice: A.** Aligned with Principle 5. Registry interface lets us swap to B later without API changes.

### Invalidation rationale for alternatives
All five decisions had ≥ 2 options evaluated. No single-option situations; the above choices reflect Principles + Drivers without false uniqueness.

---

## Goal

Build a local development dashboard for self-managed AI gateway processes. Single-operator, localhost-first, YAML-authoritative. MVP ships one tab (gateways). Architecture must absorb additional tabs without re-architecture.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (Vite dev server in dev; static SPA in prod)           │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Tab Host (generic)                                       │  │
│  │  └── <GatewaysTab />  (only tab in MVP)                   │  │
│  │                                                           │  │
│  │  Polls GET /api/gateways every 3s                          │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │ HTTP/JSON
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Fastify backend (127.0.0.1:8787 default)                        │
│  ┌──────────────────┐  ┌─────────────────┐  ┌───────────────┐   │
│  │  REST routes     │  │  YAML service   │  │  Process      │   │
│  │  /api/gateways   │◄─┤  (in-memory +   │  │  supervisor   │   │
│  │  /api/gateways/  │  │   chokidar      │  │  (spawn + PID │   │
│  │    :id/{start,   │  │   watch + atomic│  │   + tree-kill)│   │
│  │     stop,put,del}│  │   write)        │  │               │   │
│  │  /api/health     │  │                 │  │               │   │
│  └──────────────────┘  └────────┬────────┘  └───────────────┘   │
│                                │                                │
│                                ▼                                │
│                  config/gateways.yaml (source of truth)         │
│                                                                 │
│  Health prober (HTTP GET against gateway healthUrl, 2s timeout)  │
└─────────────────────────────────────────────────────────────────┘
```

**Workspace layout (pnpm workspaces):**

```
gateway-control-panel/
├── apps/
│   ├── api/                       # Fastify + Node backend
│   │   ├── src/
│   │   │   ├── server.ts          # Fastify boot, route registration
│   │   │   ├── routes/gateways.ts # REST handlers
│   │   │   ├── services/
│   │   │   │   ├── yamlStore.ts   # load/watch/atomic-write
│   │   │   │   ├── supervisor.ts  # process start/stop/health
│   │   │   │   └── healthProbe.ts
│   │   │   ├── config.ts          # server.yaml loader
│   │   │   └── types.ts
│   │   ├── test/                  # Vitest
│   │   └── package.json
│   └── web/                       # Vite + React + TS SPA
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── api/client.ts      # typed fetch wrappers + poll loop
│       │   ├── tabs/
│       │   │   ├── registry.ts    # generic TabDef registry
│       │   │   ├── TabHost.tsx    # generic host (NO gateway imports)
│       │   │   └── gateways/
│       │   │       ├── GatewaysTab.tsx
│       │   │       └── GatewayCard.tsx
│       │   └── styles.css
│       ├── test/                  # Vitest + Playwright
│       └── package.json
├── config/
│   ├── gateways.yaml              # user-edited; .gitignored
│   └── server.yaml                # bind/port/polling cadence
├── package.json                   # workspace root + concurrently
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── README.md
```

---

## Component Decomposition

| Module | Responsibility | Touches |
|---|---|---|
| `yamlStore` | Load YAML on boot; chokidar-watch (250ms debounce); atomic write-tmp + fsync + rename | `config/gateways.yaml` |
| `supervisor` | Spawn `startCommand`; capture PID; on stop: run `stopCommand`, then SIGTERM (5s grace), then `tree-kill`; track running PIDs in memory only | child_process |
| `healthProbe` | Scheduled HTTP GET against `healthUrl`; 2s timeout; emit last result per gateway | undici / fetch |
| `routes/gateways` | REST handlers; merge YAML entries + supervisor PIDs + last health result | yamlStore + supervisor + healthProbe |
| `api/client` (web) | Typed fetch wrappers + 3s polling loop | `/api/*` |
| `tabs/registry` (web) | `Map<string, TabDef>` where `TabDef = { id, path, label, component }` | none — pure |
| `TabHost` (web) | Renders tabs from registry; **MUST NOT import from `tabs/gateways/*` or `apps/api/src/types`** | registry only |
| `GatewaysTab` + `GatewayCard` (web) | Card grid + start/stop/edit/add/delete controls | api/client |

**Decoupling invariant (test-enforced, E3):** `TabHost.tsx` import graph contains zero references to `gateways` module or gateway types.

---

## Data Flow

**Read path:**
1. UI polls `GET /api/gateways` every 3s.
2. Backend merges: YAML entries (authoritative list) + supervisor's running PIDs + last health probe results.
3. Returns merged gateway list.
4. UI renders cards.

**Edit path (UI → disk):**
1. UI sends `PUT /api/gateways/:id` (or `POST` / `DELETE`).
2. Route handler updates in-memory snapshot, then `yamlStore.write(snapshot)` (atomic: write `.tmp`, fsync, rename).
3. chokidar picks up the file change, but the in-memory write is **coalesced** (the same bytes the backend just wrote) to avoid a redundant reload round-trip.
4. Supervisor reacts to entry add/remove: doesn't auto-start new entries; doesn't auto-kill removed entries (per spec scenario 1).

**External-edit path (disk → UI):**
1. Operator saves `config/gateways.yaml` in editor.
2. chokidar fires (250ms debounce).
3. yamlStore reloads + validates.
4. Next `/api/gateways` poll returns updated list.
5. UI re-renders.

**Start/Stop path:**
1. UI sends `POST /api/gateways/:id/start`.
2. Supervisor spawns `startCommand`; captures PID; records in in-memory map keyed by gateway id.
3. Next poll reflects `running=true, pid=...`.
4. On `POST .../stop`: supervisor runs `stopCommand`; waits up to 5s; if process still alive, SIGTERM (escalated via `tree-kill`), then SIGKILL after another grace period.
5. Next poll reflects `running=false`.

---

## Phased Delivery (right-sized: 4 phases)

This is greenfield — phases are build-out, not migration.

**Phase 0 — Workspace bootstrap.**
- `git init`, `.gitignore` (include `config/gateways.yaml`; commit `server.yaml.example`).
- pnpm workspace skeleton; `apps/api`, `apps/web`, root `package.json`.
- TS configs (base + per-app), `tsconfig.base.json`.
- Lint/format (ESLint + Prettier — OMX-decidable).
- Vitest + Playwright installed; one trivial passing test each.
- README skeleton: **threat model (incl. no-auth-on-LAN explicit acceptance; foreground-command expectation)**, YAML schema, tab extension contract.

**Phase 1 — Backend skeleton + YAML authority.**
- `server.yaml` loader (bind/port/polling cadence).
- `gateways.yaml` loader + atomic writer + chokidar watcher (250ms debounce).
- `GET /api/gateways` returning YAML content (no live state yet).
- `GET /api/health`.
- `PUT / POST / DELETE /api/gateways[/:id]` round-tripping through YAML.
- **Coverage:** A1, A2, A3, F1, F3 (partial).

**Phase 2 — Process supervision + health probing.**
- Supervisor: spawn + PID capture; stopCommand execution; SIGTERM/SIGKILL fallback via `tree-kill`. **Read-path liveness probe:** every `GET /api/gateways` iterates the in-memory PID map and calls `process.kill(pid, 0)` (no-signal probe) on each PID; dead PIDs are dropped from the response and their health-probe cache entries are cleared. The read path is the authoritative liveness source; exit events are a fast-path.
- Health probe: scheduled HTTP GET, 2s timeout.
- `POST /api/gateways/:id/{start,stop}`.
- `/api/gateways` now merges YAML + supervisor + health.
- **Coverage:** C1, C2, C3, G1, G2.

**Phase 3 — Frontend + tab system + e2e.**
- Vite + React + TS scaffold.
- `api/client.ts` typed wrappers + 3s polling.
- `TabHost` (generic) + `registry` (1 tab: gateways).
- `GatewaysTab` + `GatewayCard` with start/stop/edit/add/delete.
- Playwright smoke test (H1).
- README finalized.
- **Coverage:** A (full), B (full), C (full), D (full), E (full), F (full), G (full), H (full).

---

## Risks & Mitigations

| # | Risk | Mitigation |
|---|---|---|
| R1 | YAML corruption mid-write | Atomic write-tmp + fsync + rename. Optional `gateways.yaml.bak`. |
| R2 | Multi-client polling causes stale-but-overlapping UI | Polling is read-only; only writes route through backend; no client-side state of truth. |
| R3 | `startCommand` exits 0 but process dies immediately | Supervisor listens for `process.exit` as a fast-path. The read path probes `process.kill(pid, 0)` at serve time as the **authoritative** source; dead PIDs are dropped and their health-probe cache entries cleared. Card doesn't stick. |
| R4 | `stopCommand` missing/empty/fails | SIGTERM by captured PID → 5s wait → `tree-kill`. Documented in README. |
| R5 | External YAML edit removes a running gateway entry | Supervisor does NOT auto-kill orphan. Operator must explicitly stop it. UI marks it "orphaned" if a PID exists for an absent id. |
| R6 | Tab host accidentally imports gateways schema | Acceptance E3 + explicit Vitest test greps imports in `TabHost.tsx`. |
| R7 | LAN mode exposes panel without auth | Documented as user-accepted risk (spec R8); not silently mitigated. |
| R8 | YAML uses anchors / multi-doc | Restrict to single-doc YAML; reject on parse error with clear UI message. |
| R9 | Two writers race (UI edit vs external edit) | Backend is sole writer. External edits win on next reload; UI edits flush through backend synchronously. Last-write-wins on reload. |
| R10 | `startCommand` outlives the backend process | PIDs are tracked in-memory only; backend restart → orphaned processes stay running but unknown to UI. Documented as known limitation. |
| R11 | Foreground-command expectation (no daemonization) | `startCommand` / `stopCommand` are expected to be **foreground, non-daemonizing** commands. Daemonized forms (`nohup ... &`, `setsid ...`, `bash -c '... &'`) will report `running=false` because the supervisor only tracks the immediate child PID. Documented in README; Phase-2 integration test exercises the bash-fork case (`bash -c 'sleep 60 &'` → card must NOT claim running on an untracked PID). |
| R12 | Port collision on `127.0.0.1:8787` | On boot, Fastify's listen error is surfaced verbatim (EADDRINUSE message); backend exits non-zero; README documents how to override `port` in `server.yaml`. Phase-1 integration test asserts error surface. |
| R13 | Missing `config/gateways.yaml` on first run | `yamlStore.load()` returns an empty list when the file does not exist; backend boots cleanly; first UI add/edit creates the file via atomic write. Phase-1 unit + integration tests cover. |
| R14 | Concurrent start/stop on the same gateway (e.g. rapid double-click) | Supervisor guards each gateway id with a per-id in-memory lock; second concurrent start is rejected with HTTP 409; second concurrent stop is a no-op if already stopped. Phase-2 integration test. |

---

## Open Decisions (within OMX-decide boundary)

| Item | Proposing | Rationale |
|---|---|---|
| Package manager | pnpm | workspaces; aligns with monorepo |
| Lint/format | ESLint + Prettier (TS) | mainstream; matches spec hint |
| Test framework | Vitest (unit/integration) + Playwright (e2e) | spec proposal; minimal config |
| Health probe interval | 3s (matches UI poll) | shared cadence |
| Health probe timeout | 2s | spec |
| Stop-command grace period | 5s before SIGKILL | reasonable default |
| Chokidar debounce | 250ms | spec |
| UI loading state | skeleton card | boring |

---

## Out-of-Scope (binding, per spec)

- Auth, multi-node, log streaming, auto-restart, Docker/systemd, mobile responsive.

---

## Acceptance Coverage Map (handoff to test-spec)

| Acceptance criterion | Phase | Test type |
|---|---|---|
| A1 YAML is single source of truth | 1 | unit (yamlStore) |
| A2 External YAML edit reload ≤ 1s | 1 | integration (yamlStore + chokidar) |
| A3 External add → card appears, no restart | 1+3 | e2e (Playwright) |
| B1 Card fields complete | 3 | e2e (Playwright) |
| B2 Status updates ≤ 5s | 2+3 | e2e (Playwright) |
| C1 Start runs startCommand, PID within 3s | 2+3 | e2e (Playwright) |
| C2 Stop transitions to stopped within 5s, PID clears | 2+3 | e2e (Playwright) |
| C3 Non-zero startCommand exit → error surfaced, stays stopped | 2 | integration (also covers R11 bash-fork case: forked sleep does not produce a "running" card) |
| D UI edits round-trip through YAML | 1+3 | e2e (Playwright) |
| E1 Deleting `gateways` tab leaves TabHost functional | 3 | unit (Vitest) |
| E2 Adding a tab = registry entry only | 3 | unit (Vitest — register two tabs (gateways + a stub) and assert the second required zero changes to `TabHost.tsx`, per spec scenario 7) |
| E3 TabHost does not import gateways schema | 3 | unit (Vitest import-graph test) |
| F1 Default bind 127.0.0.1:8787 | 1 | integration |
| F2 `bind: 0.0.0.0` listens on all interfaces | 1 | integration |
| F3 No auth middleware in MVP | 1 | unit (route inspection) |
| G1 Health OK shows code | 2 | integration |
| G2 Unreachable healthUrl shows error after 2s | 2 | integration |
| H1 Clean clone + dev command brings up panel | 3 | e2e (Playwright smoke) |

R11-specific test (foreground-command expectation): see test-spec section "Process supervision / bash-fork regression".

| R12 port-collision surface | 1 | integration |
| R13 missing-yaml graceful boot | 1 | unit + integration |
| R14 concurrent start/stop lock | 2 | integration |

## Cross-cutting polish raised by Critic (non-blocking)

- **A1 test type** is design-leaning. Phase-3 e2e test asserts the frontend has no fetch/file-write paths to `gateways.yaml` directly (only via `/api/*`).
- **E2 mechanism** is build-time, not unit-test: assert zero changes to `TabHost.tsx` via a small Vitest test that loads `TabHost.tsx` as a string and greps for `tabs/gateways` / gateway-type imports. Documented in test-spec.
- **D2 prose** clarity: `spawn` (A) for primary supervision + `tree-kill` (C) specifically because SIGTERM does not propagate to children on macOS (known platform gap). The combination is intentional, not arbitrary.

Full test-spec lives in `.omx/plans/test-spec-gateway-control-panel.md`.
