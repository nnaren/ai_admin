# Ultragoal Brief — gateway-control-panel

> Consolidated brief from deep-interview spec + ralplan PRD + test-spec.
> This is the input to `$ultragoal create-goals` (executed manually since `omx` CLI is not available in Codex desktop).
> Codex aggregate goal mode: one stable pointer objective; OMX tracks individual stories in `ledger.jsonl`.

---

## Source artifacts

| Artifact | Path | Lines |
|---|---|---|
| Spec (deep-interview, ambiguity 0.20) | `.omx/specs/deep-interview-gateway-control-panel.md` | 308 |
| PRD (ralplan) | `.omx/plans/prd-gateway-control-panel.md` | 321 |
| Test-spec | `.omx/plans/test-spec-gateway-control-panel.md` | 293 |
| Ralplan handoff state | `.omx/state/ralplan-gateway-control-panel.json` | — |

Both Architect (1 ITERATE → 2 APPROVE) and Critic (1 APPROVE) approved. 6 critic non-blocking observations addressed (R12–R14, A1 e2e complement, E2 string-grep, D2 prose).

---

## Intent (from spec)

Build a local development dashboard for self-managed AI gateway processes. Single-operator, localhost-first, YAML-authoritative. MVP ships one tab (gateways). Architecture must absorb additional tabs without re-architecture.

## Outcome (binding)

- 18 acceptance criteria A1–H1 verified by tests
- 14 risks R1–R14 mitigated (test-enforced where possible)
- E2E smoke (H1) passes from a clean clone
- `pnpm install && pnpm dev` brings up the panel reachable at `127.0.0.1:8787`
- README documents: threat model (no-auth-on-LAN, foreground-command expectation), YAML schema, tab extension contract

## Stack (locked, not OMX-decidable)

- **Package manager:** pnpm (workspaces)
- **Backend:** Node.js + Fastify
- **Frontend:** Vite + React + TypeScript
- **File watching:** chokidar (250ms debounce)
- **Process supervision:** `child_process.spawn` + `tree-kill` (no execa)
- **YAML I/O:** Node `fs` + atomic write-tmp + fsync + rename
- **Tests:** Vitest (unit + integration) + Playwright (e2e)
- **Lint:** ESLint + Prettier

## Spec-binding constraints (must preserve)

1. TabHost MUST NOT import gateways schema (E3 / R6)
2. No auth in MVP (Round 8) — R7 documents user-accepted risk
3. Default bind `127.0.0.1:8787` (Round 8) — `bind` and `port` opt-in via `server.yaml`
4. YAML is single source of truth (Round 4) — backend is sole writer
5. Tab system generic and decoupled from business/API shape (Round 6)

## Architecture decisions (locked, from PRD)

| ID | Decision | Choice |
|---|---|---|
| D1 | Workspace topology | pnpm workspaces monorepo (`apps/api`, `apps/web`) |
| D2 | Process supervision | `child_process.spawn` + `tree-kill` fallback |
| D3 | File watching | chokidar (250ms debounce) |
| D4 | Live update channel | HTTP polling (3s default) — SSE deferred |
| D5 | Tab registry | Plain TS `Map<id, TabDef>`, eager imports |

## Phased delivery (PRD)

| Phase | Deliverable | Coverage |
|---|---|---|
| 0 | Workspace bootstrap (git, pnpm, TS, lint, test setup, README skeleton) | — |
| 1 | Backend skeleton + YAML authority | A1, A2, A3, F1, F3 (partial) |
| 2 | Process supervision + health probing + start/stop | C1, C2, C3, G1, G2 |
| 3 | Frontend + tab system + gateways UI + e2e | A–H (full) |

## Acceptance criteria (binding, all 18)

| ID | Criterion | Phase |
|---|---|---|
| A1 | YAML is single source of truth | 1+3 |
| A2 | External YAML edit reload ≤ 1s | 1 |
| A3 | External add → card appears, no restart | 1+3 |
| B1 | Card displays all required fields | 3 |
| B2 | Status updates ≤ 5s | 2+3 |
| C1 | Start runs startCommand, PID within ≤ 3s | 2+3 |
| C2 | Stop transitions to stopped within ≤ 5s, PID clears | 2+3 |
| C3 | Non-zero startCommand exit → error surfaced, stays stopped | 2 |
| D | UI edits round-trip through YAML | 1+3 |
| E1 | Deleting `gateways` tab leaves TabHost functional | 3 |
| E2 | Adding a tab = registry entry only | 3 |
| E3 | TabHost does not import gateways schema | 3 |
| F1 | Default bind 127.0.0.1:8787 | 1 |
| F2 | `bind: 0.0.0.0` listens on all interfaces | 1 |
| F3 | No auth middleware in MVP | 1 |
| G1 | Health OK shows code | 2 |
| G2 | Unreachable healthUrl shows error after 2s | 2 |
| H1 | Clean clone + `pnpm install && pnpm dev` brings up panel | 3 |

## Risk register (binding, all 14)

R1 YAML corruption / R3 silent exit / R4 stopCommand fails / R5 external edit removes running / R6 TabHost schema leak / R7 LAN no-auth (user-accepted) / R8 YAML anchors / R9 two-writer race / R10 PIDs lost on backend restart (documented limitation) / **R11 foreground-command expectation (bash-fork regression test)** / **R12 port collision (EADDRINUSE)** / **R13 missing `gateways.yaml` on first run** / **R14 concurrent start/stop on same gateway (per-id lock)**.

## OMX goal decomposition

4 OMX goals, one per PRD phase. Each goal = one ledger entry + one checkpoint.

| OMX Goal | PRD Phase | Primary AC coverage |
|---|---|---|
| G1 | Phase 0 — Workspace bootstrap | (foundational; enables all others) |
| G2 | Phase 1 — Backend skeleton + YAML authority | A1, A2, A3, F1, F3 (partial) |
| G3 | Phase 2 — Process supervision + health probing + start/stop | C1, C2, C3, G1, G2 |
| G4 | Phase 3 — Frontend + tab system + gateways UI + e2e | A (full), B, C (full), D, E, F (full), G (full), H1 |

## Execution stride

- Default: aggregate Codex goal (one stable pointer); OMX tracks individual stories.
- Stop condition per story: implementation + tests passing + audit against AC complete; checkpoint in `ledger.jsonl`.
- Final gate: ai-slop-cleaner + code-review (architect + code-reviewer) + architecture-invariant audit before `update_goal({status: "complete"})`.

## Non-goals (binding, per spec round 7)

Auth / multi-node / log streaming / auto-restart / Docker-systemd / mobile responsive — all deferred, NOT excluded.

## Residual risks to surface during execution

1. Success criteria explicit in spec; user may want to confirm A1–H1 are still right before code is written.
2. No-auth-on-LAN is user-accepted risk (Round 8); do not silently add auth "for safety."
3. YAML-as-authority means file corruption is a real failure mode; backup/atomic-write semantics must hold.
4. Frontend-command expectation must be documented in README (R11).
5. Per-id lock on start/stop (R14) prevents silent duplicate spawns.

## Definition of done

- All 18 acceptance criteria A1–H1 pass
- All 14 risks R1–R14 mitigated (test-enforced where possible)
- E2E Playwright smoke test (H1) green
- `pnpm typecheck` green across both apps
- `pnpm lint` green across both apps
- README documents threat model, YAML schema, tab extension contract
- Final ai-slop-cleaner run is clean (or all flagged items addressed)
- Final code-review (architect + code-reviewer) verdict clean
- Architecture-invariant audit: TabHost does NOT import gateways (string-grep test enforces)
- Ledger entry written for each OMX goal; final checkpoint contains cleaner + verification + review + invariant evidence
