# Context Snapshot — gateway-control-panel

- **Slug:** `gateway-control-panel`
- **Captured at:** 2026-09-12T08:13:00Z
- **Context type:** greenfield (empty project root at `/Users/yuanye/CODE/tests/ai_admin`)
- **Source:** user-provided deep-interview transcript + runtime inspection

---

## Task Statement

Build a **local development dashboard** for self-managed AI gateways. Each gateway is one card on the panel; the panel can start, stop, and inspect running gateway processes, while keeping a human-editable YAML file as the single source of truth for gateway configurations.

## Desired Outcome

A single-operator dashboard running on the user's local machine that:

- Lists every configured gateway as a card with its live running state, PID, listen port, health URL, and last health probe result.
- Lets the operator start/stop each gateway through per-gateway customizable commands.
- Reads/writes a YAML config file so manual edits and UI edits stay in sync.
- Is architected so that additional panels (e.g. model-API usage) can be added later through a generic tab/extension system without rewriting the core.

## Stated Solution

A local-first web app:

- **Backend:** Fastify (Node.js) on `127.0.0.1:8787` by default; YAML config; file-watch for external edits; `bind` configurable to `0.0.0.0` for opt-in LAN.
- **Frontend:** Vite + React + TypeScript SPA.
- **Process control:** Per-gateway `startCommand` / `stopCommand` from YAML, executed by the backend.
- **Plugin model:** Tab system is generic — tabs are self-contained modules registered by route, decoupled from any specific business/API shape.

## Probable Intent Hypothesis

The user runs multiple self-hosted AI gateway processes (likely proxies / routing layers in front of upstream model APIs) on their dev box and wants a single control surface to see what is running, restart things, and tune the configuration. The decision to keep YAML as the source of truth suggests they value being able to reason about and edit the config with normal text tools; the panel is an overlay, not a replacement. The "generic tab system" requirement implies they already anticipate more than one domain (gateways today, API-usage / billing tomorrow) but do not want to over-design.

## Known Facts / Evidence

| Source | Fact |
|---|---|
| Round 1 answer | "本地开发自用" (local dev self-use). |
| Round 2 answer | Per-card fields = running/stopped, PID, port, health URL, last health status. |
| Round 3 answer + free text | Per-gateway customizable start/stop commands; no built-in abstraction layer. |
| Round 4 answer | YAML is source of truth; UI read/write; file edits outside panel picked up via reload. |
| Round 5 answer | Default tech stack accepted (Vite + React + TS + Fastify + YAML, single localhost backend). |
| Round 6 answer | Tab system must be **generic** and decoupled from business / API shape; "model API dashboard" is one possible future tab, not a baked-in second tab. |
| Round 7 answer | No formal non-goals. 6 candidate non-goals (auth, remote nodes, log streaming, auto-restart, Docker/systemd abstraction, mobile responsive) are deferred/future, not excluded. |
| Round 8 answer | Default bind `127.0.0.1:8787`; opt-in LAN via config edit; no auth in MVP (self-imposed risk: user's choice to enable). |

## Constraints

- **Stack:** Vite + React + TypeScript frontend; Fastify (Node.js) backend; YAML config storage.
- **Networking:** Backend defaults to `127.0.0.1:8787`; bind and port overridable via config.
- **Authority:** YAML is the source of truth; UI edits write back to YAML.
- **Extensibility:** Tab/extension system must be generic and decoupled from any specific business or API shape.
- **Process control:** Per-gateway commands are user-defined strings, not template abstractions.

## Unknowns / Open Questions

None blocking execution. The following are **deferred** (per Round 7), not unknowns:

- Auth / login
- Multi-node / remote gateway control
- Log streaming / tailing
- Auto-restart on crash
- Docker / systemd abstraction
- Mobile responsive UI

## Decision-Boundary Unknowns

All decision boundaries are explicit (see `spec`). Items below are open for OMX to decide without confirmation:

- Specific npm package versions
- Lint / format toolchain (e.g. ESLint, Prettier, Biome)
- YAML schema field details beyond the agreed minimum (health-check method, retry policy, polling cadence — propose 3s, easily overridden)
- Polling default (proposing 3s, easy to override)
- UI copy / theme / icon set
- Test framework choice (proposing Vitest + Playwright)

Items that OMX **must NOT decide without confirmation**:

- Switching tech stack
- Adding auth
- Changing default bind-address behavior
- Baking business-specific tab UIs into the generic tab system

## Likely Codebase Touchpoints

Greenfield — no existing code. Likely first-touch layout when execution begins:

- `package.json` (workspace root, with `apps/web` and `apps/api` or single-folder split)
- `config/gateways.yaml` (canonical YAML, gitignored for personal data, or kept depending on user preference)
- `apps/api/src/` — Fastify server, YAML I/O, child-process supervision, file watcher
- `apps/web/src/` — Vite/React/TS UI, tab registry, gateway card component, generic tab host
- `apps/web/src/tabs/` — extension point for future tabs

## Repo Docs / Rules / Context Inspected

| Path | Notes |
|---|---|
| `/Users/yuanye/CODE/tests/ai_admin` (cwd) | Empty directory; no `AGENTS.md`, no `README.md`, no `CONTEXT.md`, no `docs/`. |
| `.omx/` | Created by this interview session; pre-existed only as planned output. |
| `.git/` | Not present; project is not yet a git repo. |

No brownfield grounding required.

## Terminology / Doc-Code Conflicts

None yet (greenfield). User-supplied terms recorded for downstream consistency:

- **gateway** — a single long-running proxy / routing process listed in the YAML config. Distinct from "tab" (UI surface) and from "model API" (upstream provider layer that may become a future tab).
- **tab** — a generic, route-registered UI module. The MVP ships one tab (gateways); future tabs are loaded by the same mechanism without changes to the tab host.
- **health check** — an HTTP GET against the configured `healthUrl`; success is a 2xx response.
- **source of truth** — the YAML file on disk; the in-memory state is a projection.

## Initial-Context Summary Status

`not_needed` — the interview transcript itself is prompt-safe (well under budget) and contains the full requirements context. No oversize summary gate triggered.

---

## Ready-for-Execution Snapshot

- Ambiguity at or below profile threshold (0.20 <= 0.20).
- Non-goals explicit (Round 7).
- Decision boundaries explicit (transcript tail).
- Pressure pass complete (Round 1 revisited in Round 8; Round 5 assumption pressured by Round 6 generic-tab requirement).
- Spec artifact can be generated.
