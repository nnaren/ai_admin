import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Gateway } from '../types.js';

const execFileAsync = promisify(execFile);

/** Port used to detect an already-listening gateway process. */
export function listenPort(gateway: Pick<Gateway, 'port' | 'healthUrl' | 'openUrl'>): number | undefined {
  if (typeof gateway.port === 'number' && Number.isFinite(gateway.port)) {
    return gateway.port;
  }
  for (const raw of [gateway.healthUrl, gateway.openUrl]) {
    if (!raw) continue;
    try {
      const value = new URL(raw).port;
      if (value) return Number(value);
    } catch {
      // ignore invalid URLs
    }
  }
  return undefined;
}

/** PID of the process listening on TCP port, if any. */
export async function findListenerPid(port: number): Promise<number | undefined> {
  try {
    const { stdout } = await execFileAsync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']);
    const pid = Number(stdout.trim().split(/\s+/)[0]);
    return Number.isInteger(pid) && pid > 0 ? pid : undefined;
  } catch {
    return undefined;
  }
}
