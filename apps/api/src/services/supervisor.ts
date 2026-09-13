import { spawn, type ChildProcess } from 'node:child_process';
import treeKill from 'tree-kill';
import type { Gateway } from '../types.js';
import { findListenerPid, listenPort } from './listenPort.js';

/**
 * Process supervisor for gateway start/stop.
 *
 * Foreground, non-daemonizing commands only. See README "Threat model" and
 * PRD R11. Daemonized forms (`nohup ... &`, `setsid ...`, `bash -c '...' &`)
 * will report `running=false` on the panel because we only track the
 * immediate child PID.
 *
 * R3 mitigation: read-path liveness probe (isAlive) — every getStatus() call
 * verifies the PID via `process.kill(pid, 0)` and drops dead PIDs.
 *
 * R14 mitigation: per-id lock — concurrent start of the same gateway returns
 * 'already-running'; concurrent stop of an already-stopped gateway is a no-op.
 */
type SupervisorState = {
  child?: ChildProcess;
  pid: number;
  startedAt: string;
  /** True when we attached to a process we did not spawn (R10). */
  adopted?: boolean;
};

export class Supervisor {
  private readonly running = new Map<string, SupervisorState>();
  private readonly locks = new Map<string, Promise<void>>();
  private readonly lastErrors = new Map<string, string>();

  /**
   * Start a gateway. Returns the captured PID or throws.
   */
  async start(gateway: Gateway): Promise<{ pid: number }> {
    const existing = this.lockAndGet(gateway.id);
    try {
      if (existing && this.isAlive(existing.pid)) {
        throw new StartError(`already-running:${gateway.id}`, existing.pid);
      }
      const attached = await this.reconcile(gateway);
      if (attached !== undefined) {
        this.lastErrors.delete(gateway.id);
        return { pid: attached };
      }
      const child = spawn(gateway.startCommand, {
        shell: true,
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (typeof child.pid !== 'number') {
        child.kill('SIGKILL');
        throw new StartError(`spawn-failed:${gateway.id}`);
      }
      // Capture exit during the startup window. This catches R11 (bash-fork)
      // and C3 (non-zero exit) because the shell wrapper exits immediately
      // before the long-lived process is established.
      const startupState: { exited: { code: number | null } | null } = { exited: null };
      child.once('exit', (code) => {
        startupState.exited = { code };
      });

      let output = '';
      const append = (buf: Buffer | string): void => {
        output += buf.toString();
        if (output.length > 2000) output = output.slice(-2000);
      };
      child.stdout?.on('data', append);
      child.stderr?.on('data', append);

      // Require the process to be alive for 500ms straight before declaring
      // it started. This filters out shell wrappers that exit immediately
      // after forking a daemonized child.
      const deadline = Date.now() + 3000;
      let aliveSince: number | null = null;
      while (Date.now() < deadline) {
        const exited = startupState.exited;
        if (exited) {
          const recovered = await this.reconcile(gateway);
          if (recovered !== undefined) {
            this.lastErrors.delete(gateway.id);
            return { pid: recovered };
          }
          throw this.failStart(gateway.id, `exit-immediately:${gateway.id}`, exited.code ?? -1, output);
        }
        if (this.isAlive(child.pid)) {
          if (aliveSince === null) aliveSince = Date.now();
          if (Date.now() - aliveSince >= 500) {
            // Promote: install the permanent running-state entry and
            // the permanent exit listener (which removes from the map).
            this.lastErrors.delete(gateway.id);
            this.running.set(gateway.id, {
              child,
              pid: child.pid,
              startedAt: new Date().toISOString(),
            });
            child.on('exit', () => {
              const cur = this.running.get(gateway.id);
              if (cur && cur.pid === child.pid) {
                this.running.delete(gateway.id);
              }
            });
            return { pid: child.pid };
          }
        } else {
          aliveSince = null;
        }
        await sleep(50);
      }
      const recovered = await this.reconcile(gateway);
      if (recovered !== undefined) {
        this.lastErrors.delete(gateway.id);
        return { pid: recovered };
      }
      throw this.failStart(gateway.id, `exit-immediately:${gateway.id}`, undefined, output);
    } finally {
      this.unlock(gateway.id);
    }
  }

  getLastError(id: string): string | undefined {
    return this.lastErrors.get(id);
  }

  /**
   * Stop a gateway. Tries stopCommand first, then SIGTERM, then tree-kill.
   * No-op if not running.
   */
  async stop(gateway: Gateway, graceMs = 5000): Promise<void> {
    await this.lockAndAcquire(gateway.id);
    try {
      await this.reconcile(gateway);
      const state = this.running.get(gateway.id);
      if (!state) return;
      const { pid } = state;
      if (!this.isAlive(pid)) {
        this.running.delete(gateway.id);
        return;
      }

      // Try stopCommand first (if defined).
      if (gateway.stopCommand) {
        try {
          await runShellCommand(gateway.stopCommand, 2000);
        } catch {
          // fall through to SIGTERM
        }
      }

      // Wait up to graceMs for graceful exit.
      const deadline = Date.now() + graceMs;
      while (Date.now() < deadline && this.isAlive(pid)) {
        await sleep(100);
      }

      if (!this.isAlive(pid)) {
        this.running.delete(gateway.id);
        return;
      }

      // Escalate to SIGTERM.
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        // already dead
      }
      const termDeadline = Date.now() + 2000;
      while (Date.now() < termDeadline && this.isAlive(pid)) {
        await sleep(100);
      }
      if (!this.isAlive(pid)) {
        this.running.delete(gateway.id);
        return;
      }

      // Final fallback: tree-kill SIGKILL.
      await new Promise<void>((resolve) => {
        treeKill(pid, 'SIGKILL', () => resolve());
      });
      this.running.delete(gateway.id);
    } finally {
      this.unlock(gateway.id);
    }
  }

  /**
   * Authoritative liveness check. Drops dead PIDs from the map and returns
   * the cleaned status. This is the read-path probe (R3 mitigation).
   */
  isAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === 'ESRCH') return false;
      if (e.code === 'EPERM') return true; // process exists but we can't signal
      return false;
    }
  }

  /**
   * Authoritative read: returns the live PID if alive, undefined otherwise.
   * Drops dead PIDs as a side effect.
   */
  getLivePid(gatewayId: string): number | undefined {
    const state = this.running.get(gatewayId);
    if (!state) return undefined;
    if (!this.isAlive(state.pid)) {
      this.running.delete(gatewayId);
      return undefined;
    }
    return state.pid;
  }

  /**
   * Attach to a process already listening on the gateway port.
   * Used when health is OK but the in-memory PID map was lost (R10).
   */
  async reconcile(gateway: Gateway): Promise<number | undefined> {
    const live = this.getLivePid(gateway.id);
    if (live !== undefined) return live;
    const port = listenPort(gateway);
    if (port === undefined) return undefined;
    const pid = await findListenerPid(port);
    if (pid === undefined || !this.isAlive(pid)) return undefined;
    this.lastErrors.delete(gateway.id);
    this.running.set(gateway.id, {
      pid,
      startedAt: new Date().toISOString(),
      adopted: true,
    });
    return pid;
  }

  /** Stop spawned children only; leave adopted (external) processes running. */
  async shutdown(): Promise<void> {
    for (const [id, state] of this.running.entries()) {
      if (state.adopted) {
        this.running.delete(id);
        continue;
      }
      try {
        await new Promise<void>((resolve) => {
          treeKill(state.pid, 'SIGKILL', () => resolve());
        });
      } catch {
        // ignore
      }
      this.running.delete(id);
    }
  }

  // ---- Internal concurrency control ----

  private lockAndGet(id: string): SupervisorState | undefined {
    return this.running.get(id);
  }

  private async lockAndAcquire(id: string): Promise<void> {
    // Per-id serial queue: each new caller awaits the previous one's promise.
    // Serializes start/stop on the same gateway id without blocking others.
    const prev = this.locks.get(id) ?? Promise.resolve();
    const next = prev.then(() => undefined);
    this.locks.set(id, next);
    await prev;
  }

  private unlock(id: string): void {
    const cur = this.locks.get(id);
    if (cur) this.locks.delete(id);
  }

  private failStart(id: string, code: string, pid?: number, output?: string): StartError {
    const err = new StartError(code, pid, output?.trim());
    this.lastErrors.set(id, err.message);
    return err;
  }
}

// ---- Helpers ----

export class StartError extends Error {
  readonly code: string;
  readonly pid?: number;
  constructor(code: string, pid?: number, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
    this.pid = pid;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function runShellCommand(cmd: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, { shell: true, stdio: 'ignore' });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore
      }
      reject(new Error('timeout'));
    }, timeoutMs);
    child.on('exit', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`exit ${code}`));
    });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
  });
}

