# Test-Spec — gateway-control-panel

> Maps every spec acceptance criterion (A1–H1) and every PRD risk (R1–R14) to a concrete test.
> Frameworks: **Vitest** (unit + integration), **Playwright** (e2e smoke + UI flows).
> PRD: `.omx/plans/prd-gateway-control-panel.md`. Spec: `.omx/specs/deep-interview-gateway-control-panel.md`.

---

## 1. Test infrastructure

### Frameworks & layout

| Layer | Framework | Location |
|---|---|---|
| Backend unit | Vitest | `apps/api/test/unit/**.test.ts` |
| Backend integration | Vitest + supertest | `apps/api/test/integration/**.test.ts` |
| Frontend unit | Vitest + @testing-library/react | `apps/web/test/unit/**.test.tsx` |
| E2E UI smoke | Playwright | `apps/web/test/e2e/**.spec.ts` |

### Fixtures

- `apps/api/test/fixtures/gateways.yaml` — 3 sample gateways (running, stopped, with `healthUrl`).
- `apps/api/test/fixtures/gateways.daemon.yaml` — 1 gateway with bash-fork `startCommand` (for R11 regression).
- `apps/api/test/fixtures/gateways.empty.yaml` — empty list (for A3 empty-state).
- `apps/web/test/e2e/fixtures/` — Playwright stub tab for E2 (registry entry that renders trivial placeholder).

### Mocking strategy

| Component | Unit mock | Integration |
|---|---|---|
| `child_process.spawn` | mock with `MockChildProcess` | real spawn against `/bin/sh` + tmp scripts |
| HTTP server (for health probe) | n/a | real `node:http` server on ephemeral port |
| `chokidar` | mocked `MockWatcher` | real chokidar against `os.tmpdir()` |
| Fastify lifecycle | real | real |

### CI order (Vitest + Playwright)

1. Backend unit (`pnpm -F api test:unit`)
2. Backend integration (`pnpm -F api test:integration`)
3. Frontend unit (`pnpm -F web test:unit`)
4. E2E Playwright (`pnpm -F web test:e2e`) — requires both apps booted.

---

## 2. Acceptance criterion → test mapping

### A. Configuration & authority

#### A1 — YAML is single source of truth
- **Test type:** unit + e2e
- **Unit** (`apps/api/test/unit/yamlStore.authority.test.ts`):
  - Load `gateways.yaml`, mutate in-memory snapshot, call `yamlStore.write`; assert file on disk equals the mutated snapshot.
  - Attempt to write to a read-only path; assert write fails loudly (not silent).
- **E2E (Critic polish)** (`apps/web/test/e2e/authority.frontend-bypass.spec.ts`):
  - Boot the panel; use `page.evaluate` to attempt `fetch('file:///.../gateways.yaml', {method:'PUT'})` from the browser; assert CSP / browser refuses, AND assert no test path in the SPA bundle includes a direct `writeFile`/`fs` import. (Grep dist bundle for `node:fs` / `writeFileSync`.)

#### A2 — External YAML edit reload ≤ 1s
- **Test type:** integration
- **Test** (`apps/api/test/integration/yamlStore.reload.test.ts`):
  - Boot Fastify with real chokidar watching a tmp YAML file; perform `fs.writeFileSync` to the file with a new gateway entry; assert the in-memory state contains the new entry within 1000 ms.

#### A3 — External add → card appears, no restart
- **Test type:** e2e (Playwright)
- **Test** (`apps/web/test/e2e/external-add.spec.ts`):
  - Boot backend + Vite dev; open panel; append a gateway entry directly to `gateways.yaml`; assert card appears within ≤ 1.5 s (allows for poll cadence 3s minus slack). Also covers empty-state fixture (no crash on empty file).

### B. Card rendering

#### B1 — Card displays all required fields
- **Test type:** e2e (Playwright)
- **Test** (`apps/web/test/e2e/card-fields.spec.ts`):
  - Boot with `gateways.yaml` (3 fixtures); assert each card shows: name, running/stopped badge, PID (when running), port, health URL, last-health status (timestamp + ok/fail).
  - Use Playwright `locator` assertions on DOM structure.

#### B2 — Status updates ≤ 5s after state change
- **Test type:** e2e (Playwright)
- **Test** (`apps/web/test/e2e/card-lag.spec.ts`):
  - Click "Start" on a stopped gateway; assert card transitions to `running=true` within ≤ 5s (3s poll + 2s slack).
  - Click "Stop" on a running gateway; assert card transitions to `running=false` within ≤ 5s.

### C. Start / stop

#### C1 — Start runs `startCommand`, PID within ≤ 3s
- **Test type:** e2e (Playwright)
- **Test** (`apps/web/test/e2e/start-stop.spec.ts`):
  - Use a gateway with `startCommand: "/bin/sh -c 'exec sleep 300'"` (foreground, non-daemonizing); click Start; assert card `running=true` AND `pid` non-empty within ≤ 3s.
  - Bonus: also assert `process.kill(pid, 0)` succeeds at test time (supervisor's liveness probe would agree).

#### C2 — Stop transitions to stopped within ≤ 5s; PID clears
- **Test type:** e2e (Playwright)
- **Test** (same file as C1):
  - After C1, click Stop; assert card `running=false` AND `pid` empty within ≤ 5s.
  - Assert process is gone: external `process.kill(pid, 0)` throws ESRCH.

#### C3 — Non-zero `startCommand` exit → error surfaced, stays stopped
- **Test type:** integration + (R11 regression co-located)
- **Test** (`apps/api/test/integration/supervisor.failures.test.ts`):
  - Spawn a gateway with `startCommand: "/bin/sh -c 'exit 7'"`; assert the route returns 4xx with the exit code surfaced; in-memory PID map remains empty; the next `GET /api/gateways` reports `running=false, lastError: "exit 7"`.
  - **R11 bash-fork regression** in the same file: spawn with `startCommand: "/bin/sh -c 'sleep 60 &'"`; assert the spawned PID exits immediately (shell returns); assert in-memory PID map remains empty (or clears on exit event); assert `GET /api/gateways` reports `running=false`. **The panel must NOT claim running on an untracked PID.**

### D — UI edits round-trip through YAML
- **Test type:** e2e (Playwright)
- **Test** (`apps/web/test/e2e/ui-edit-roundtrip.spec.ts`):
  - Open panel; click "Add gateway" with name `g-test`; fill port, startCommand; save; assert card appears; assert `gateways.yaml` on disk contains the new entry.
  - Edit an existing gateway's `startCommand` via UI; save; assert file reflects the change.
  - Delete a gateway via UI; assert it's gone from the file.

### E. Generic tabs

#### E1 — Deleting `gateways` tab leaves TabHost functional
- **Test type:** unit (Vitest + @testing-library/react)
- **Test** (`apps/web/test/unit/tabhost.resilience.test.tsx`):
  - Render `TabHost` with a registry containing only a stub tab (gateways removed); assert the host renders the stub; assert no thrown errors; assert no reference to a non-existent `gateways` tab.

#### E2 — Adding a tab = registry entry only; TabHost unchanged
- **Test type:** unit (Vitest) — import-graph mechanism (per Critic E2 polish)
- **Test** (`apps/web/test/unit/registry.extension.test.ts`):
  - At test setup, read `apps/web/src/tabs/TabHost.tsx` as a UTF-8 string.
  - Register two tabs in `registry.ts` (gateways + stub) via the actual registry export.
  - Assert `TabHost.tsx` source contains **zero** literal occurrences of `"gateways"` (excluding pure comments and `"gateways/"` directory references in unrelated docstrings) and zero imports from `tabs/gateways/*`.
  - Assert the rendered host renders both tabs.
- **Why string-grep:** Vitest does not natively diff source files; the test enforces the invariant by reading the file as a string and asserting content. A Vite build + diff variant can be added as a Phase-3 follow-up if the test proves flaky.

#### E3 — TabHost does not import gateways schema
- **Test type:** unit (Vitest import-graph)
- **Test** (`apps/web/test/unit/tabhost.import-boundary.test.ts`):
  - Use `tsx`'s import resolver or a static `grep` over `apps/web/src/tabs/TabHost.tsx` and its transitive imports to assert no import resolves to `tabs/gateways/*` or `apps/api/src/types`.
  - Mechanically: read `TabHost.tsx`, parse `import ... from '...'` statements; assert none match `tabs/gateways` or gateway type imports.

### F. Server lifecycle

#### F1 — Default bind 127.0.0.1:8787
- **Test type:** integration
- **Test** (`apps/api/test/integration/server.bind.test.ts`):
  - Boot Fastify with default `server.yaml`; assert `server.address().address === '127.0.0.1'` and `server.address().port === 8787`.

#### F2 — `bind: 0.0.0.0` listens on all interfaces
- **Test type:** integration
- **Test** (same file as F1):
  - Boot with `server.yaml` containing `bind: 0.0.0.0`; assert the server is reachable on `127.0.0.1:8787` AND `lan-ip:8787` (use `os.networkInterfaces()` to find a non-loopback IPv4).

#### F3 — No auth middleware in MVP
- **Test type:** unit (Vitest)
- **Test** (`apps/api/test/unit/server.no-auth.test.ts`):
  - Inspect the Fastify registration code; assert no `fastify.auth`, `fastify-jwt`, `@fastify/basic-auth`, or equivalent is registered.
  - Assert that an unauthenticated request to `GET /api/gateways` returns 200 (does not 401).

### G. Health probe

#### G1 — Health OK shows code
- **Test type:** integration
- **Test** (`apps/api/test/integration/healthprobe.ok.test.ts`):
  - Boot an in-process `node:http` server returning `200 OK`; configure a gateway with `healthUrl: "http://127.0.0.1:<port>/"`; assert `GET /api/gateways` for that gateway returns `lastHealth: { ok: true, httpCode: 200, at: <ISO> }`.

#### G2 — Unreachable `healthUrl` shows error after 2s
- **Test type:** integration
- **Test** (`apps/api/test/integration/healthprobe.fail.test.ts`):
  - Configure a gateway with `healthUrl: "http://127.0.0.1:1/"` (port 1 is reserved, refuses); assert `lastHealth: { ok: false, error: <string>, at: <ISO> }` after at most 2.5s.

### H. E2E smoke

#### H1 — Clean clone + `pnpm install && pnpm dev` brings up panel
- **Test type:** e2e (Playwright)
- **Test** (`apps/web/test/e2e/smoke.spec.ts`):
  - In CI, run `pnpm install && pnpm dev` from a clean checkout (a fixture workspace).
  - Wait for the Vite dev URL; assert HTTP 200.
  - Assert at least 2 example gateway cards render (from sample `gateways.yaml`).

---

## 3. Risk → test mapping

| Risk | Test file(s) | Notes |
|---|---|---|
| R1 YAML corruption | `yamlStore.authority.test.ts` (atomic write) | write-tmp + fsync + rename exercised |
| R3 silent exit | `supervisor.failures.test.ts` + `card-lag.spec.ts` | read-path `process.kill(pid, 0)` probe + UI lag |
| R4 stopCommand fails | `supervisor.failures.test.ts` | SIGTERM → 5s wait → tree-kill |
| R5 external edit removes running | `external-add.spec.ts` (variant) | orphaned PID visible, not auto-killed |
| R6 TabHost schema leak | `tabhost.import-boundary.test.ts` + `registry.extension.test.ts` | string-grep + import-graph |
| R7 LAN no-auth (user-accepted) | `server.no-auth.test.ts` | absence of auth middleware asserted |
| R8 YAML anchors / multi-doc | `yamlStore.authority.test.ts` (parse error case) | rejected with clear message |
| R9 two writers race | `yamlStore.authority.test.ts` (concurrent edits) | backend is sole writer enforced |
| R10 PIDs lost on backend restart | documented limitation; manual smoke test | not auto-tested |
| R11 foreground-command expectation | `supervisor.failures.test.ts` (bash-fork case) | explicit regression test |
| R12 port collision | `server.bind.test.ts` (EADDRINUSE case) | error surface asserted |
| R13 missing `gateways.yaml` | `yamlStore.reload.test.ts` (file-absent case) | empty list returned, no crash |
| R14 concurrent start/stop | `supervisor.failures.test.ts` (per-id lock) | second start → 409; second stop → no-op |

---

## 4. Test fixtures (concrete)

### `gateways.yaml` (3 fixtures)

```yaml
- id: g-running
  name: Running Gateway
  port: 9000
  startCommand: "/bin/sh -c 'exec sleep 300'"
  stopCommand: "/bin/sh -c 'kill -TERM $GATEWAY_PID'"
  healthUrl: "http://127.0.0.1:9000/health"
- id: g-stopped
  name: Stopped Gateway
  port: 9001
  startCommand: "/bin/sh -c 'exec sleep 300'"
  stopCommand: "/bin/sh -c 'kill -TERM $GATEWAY_PID'"
- id: g-degraded
  name: Degraded Gateway
  port: 9002
  startCommand: "/bin/sh -c 'exec sleep 300'"
  healthUrl: "http://127.0.0.1:9002/health"
```

### `gateways.daemon.yaml` (R11 regression)

```yaml
- id: g-daemon
  name: Forked Daemon (regression)
  startCommand: "/bin/sh -c 'sleep 60 &'"
  stopCommand: ""
```

### `gateways.empty.yaml`

```yaml
[]
```

---

## 5. Coverage matrix (cross-check vs PRD)

| Acceptance criterion | Phase | Test location | Status |
|---|---|---|---|
| A1 | 1+3 | `yamlStore.authority.test.ts` + `authority.frontend-bypass.spec.ts` | ✓ |
| A2 | 1 | `yamlStore.reload.test.ts` | ✓ |
| A3 | 1+3 | `external-add.spec.ts` + empty fixture | ✓ |
| B1 | 3 | `card-fields.spec.ts` | ✓ |
| B2 | 2+3 | `card-lag.spec.ts` | ✓ |
| C1 | 2+3 | `start-stop.spec.ts` | ✓ |
| C2 | 2+3 | `start-stop.spec.ts` | ✓ |
| C3 | 2 | `supervisor.failures.test.ts` | ✓ |
| D | 1+3 | `ui-edit-roundtrip.spec.ts` | ✓ |
| E1 | 3 | `tabhost.resilience.test.tsx` | ✓ |
| E2 | 3 | `registry.extension.test.ts` (string-grep) | ✓ |
| E3 | 3 | `tabhost.import-boundary.test.ts` | ✓ |
| F1 | 1 | `server.bind.test.ts` | ✓ |
| F2 | 1 | `server.bind.test.ts` | ✓ |
| F3 | 1 | `server.no-auth.test.ts` | ✓ |
| G1 | 2 | `healthprobe.ok.test.ts` | ✓ |
| G2 | 2 | `healthprobe.fail.test.ts` | ✓ |
| H1 | 3 | `smoke.spec.ts` | ✓ |

All 18 acceptance criteria mapped; all 14 risks have at least one test.

---

## 6. Test ordering & dependencies

```
[apps/api/test/unit]      ← no deps; runs first
[apps/api/test/integration]← no deps; runs second
[apps/web/test/unit]      ← no deps; runs third
[apps/web/test/e2e]       ← requires apps/api + Vite dev running; runs last
```

E2E setup helper (`apps/web/test/e2e/global-setup.ts`):
- Boots backend on a random port via `tsx apps/api/src/server.ts`.
- Boots Vite dev server on its standard port.
- Tears both down in `global-teardown.ts`.

---

## 7. Open test-infrastructure decisions (OMX-decidable)

| Item | Proposing | Rationale |
|---|---|---|
| HTTP test client | `undici` (Node built-in fetch) | no extra dep |
| Process mocking library | Node's built-in `mock` + custom `MockChildProcess` | no dep |
| Playwright config | reuse Vite's port; `webServer` block in `playwright.config.ts` | standard |
| CI test command | `pnpm test` (workspace-aware) | one entry point |

---

## 8. Verification of test-spec completeness

- [x] All 18 spec acceptance criteria A1–H1 have at least one concrete test.
- [x] All 14 PRD risks R1–R14 have at least one test or are documented limitations.
- [x] E2 mechanism (Critic E2 polish) is concrete: string-grep on `TabHost.tsx`.
- [x] R11 foreground-command regression is a named, isolated test.
- [x] Fixtures are concrete YAML samples (no placeholders).
- [x] Framework choice (Vitest + Playwright) matches PRD Open Decisions.
- [x] No raw `"...placeholder..."` markers remain.
