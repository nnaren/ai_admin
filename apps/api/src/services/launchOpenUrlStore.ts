import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type LaunchRecord = { pid: number; url: string };

/**
 * Persist gateway launch URLs (e.g. dsh ?token=) keyed by gateway id + pid.
 * Survives API process restarts while the gateway child keeps running.
 */
export class LaunchOpenUrlStore {
  private readonly filePath: string;
  private cache = new Map<string, LaunchRecord>();
  private loaded = false;

  constructor(filePath = path.join(os.tmpdir(), 'gcp-launch-open-urls.json')) {
    this.filePath = filePath;
  }

  async set(id: string, pid: number, url: string): Promise<void> {
    await this.ensureLoaded();
    this.cache.set(id, { pid, url });
    await this.flush();
  }

  async get(id: string, pid: number | undefined): Promise<string | undefined> {
    if (pid === undefined) return undefined;
    await this.ensureLoaded();
    const rec = this.cache.get(id);
    if (!rec || rec.pid !== pid) return undefined;
    return rec.url;
  }

  async clear(id: string): Promise<void> {
    await this.ensureLoaded();
    if (!this.cache.delete(id)) return;
    await this.flush();
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, LaunchRecord>;
      for (const [id, rec] of Object.entries(parsed)) {
        if (
          rec &&
          typeof rec.pid === 'number' &&
          typeof rec.url === 'string' &&
          rec.url.includes('token=')
        ) {
          this.cache.set(id, rec);
        }
      }
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code !== 'ENOENT') {
        // Corrupt file — start empty.
        this.cache.clear();
      }
    }
  }

  private async flush(): Promise<void> {
    const obj: Record<string, LaunchRecord> = {};
    for (const [id, rec] of this.cache) obj[id] = rec;
    await fs.writeFile(this.filePath, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
  }
}
