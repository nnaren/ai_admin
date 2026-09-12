import { describe, it, expect } from 'vitest';
import { Supervisor, StartError } from '../../src/services/supervisor.js';
import type { Gateway } from '../../src/types.js';

describe('Supervisor', () => {
  it('C1: captures PID for foreground command', async () => {
    const sup = new Supervisor();
    try {
      const gw: Gateway = { id: 'g1', name: 'fg', startCommand: 'exec sleep 30' };
      const { pid } = await sup.start(gw);
      expect(pid).toBeGreaterThan(0);
      expect(sup.isAlive(pid)).toBe(true);
    } finally {
      await sup.shutdown();
    }
  });

  it('C3: non-zero exit surfaces error; not running', async () => {
    const sup = new Supervisor();
    const gw: Gateway = { id: 'g2', name: 'fail', startCommand: 'exit 7' };
    await expect(sup.start(gw)).rejects.toThrow();
    expect(sup.getLivePid('g2')).toBeUndefined();
  });

  it('R11: bash-fork startCommand does NOT produce a running card', async () => {
    const sup = new Supervisor();
    const gw: Gateway = {
      id: 'g-fork',
      name: 'forked',
      startCommand: 'sleep 60 &',
    };
    // The shell wrapper exits 0 immediately; PID it returns is the wrapper, not sleep.
    await expect(sup.start(gw)).rejects.toThrow(/exit-immediately|forked/i);
    // No live PID tracked.
    expect(sup.getLivePid('g-fork')).toBeUndefined();
    await sup.shutdown();
  });

  it('C2: stop transitions and clears PID', async () => {
    const sup = new Supervisor();
    const gw: Gateway = { id: 'g3', name: 's', startCommand: 'exec sleep 60' };
    const { pid } = await sup.start(gw);
    expect(sup.getLivePid('g3')).toBe(pid);
    await sup.stop(gw);
    // After stop, getLivePid must return undefined (R3 read-path probe).
    expect(sup.getLivePid('g3')).toBeUndefined();
    await sup.shutdown();
  });

  it('R14: concurrent start of same gateway returns already-running error', async () => {
    const sup = new Supervisor();
    const gw: Gateway = { id: 'g4', name: 'r14', startCommand: 'exec sleep 60' };
    try {
      const first = await sup.start(gw);
      expect(first.pid).toBeGreaterThan(0);
      // Second start of same id should fail with StartError.
      await expect(sup.start(gw)).rejects.toBeInstanceOf(StartError);
    } finally {
      await sup.shutdown();
    }
  });

  it('R14: stop on already-stopped gateway is a no-op (does not throw)', async () => {
    const sup = new Supervisor();
    const gw: Gateway = { id: 'g5', name: 'r14b', startCommand: 'exec sleep 60' };
    await expect(sup.stop(gw)).resolves.toBeUndefined();
  });
});
