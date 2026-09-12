import { promises as fs } from 'node:fs';
import path from 'node:path';
import chokidar from 'chokidar';
import { parse as parseYaml, stringify as SerializeYaml } from 'yaml';
import type { Gateway } from '../types.js';

/**
 * Single source of truth for gateway definitions.
 *
 * Spec F3 / A1: YAML is the only authority. Backend is the sole writer.
 *
 * R1 mitigation: atomic write-tmp + fsync + rename to avoid corruption.
 * R9 mitigation: backend is sole writer; external edits win on next reload.
 * R13: missing file on first run returns empty list.
 */
export class YamlStore {
  private gateways: Gateway[] = [];
  private watcher: ReturnType<typeof chokidar.watch> | null = null;
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  /**
   * Load YAML. If file is absent (R13), returns empty list without throwing.
   * If file is malformed, throws — caller surfaces to the UI.
   */
  async load(): Promise<Gateway[]> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = parseYaml(raw);
      if (parsed === null || parsed === undefined) {
        this.gateways = [];
        return [];
      }
      if (!Array.isArray(parsed)) {
        throw new Error(`YAML root must be an array, got ${typeof parsed}`);
      }
      this.gateways = parsed as Gateway[];
      return this.gateways;
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === 'ENOENT') {
        this.gateways = [];
        return [];
      }
      throw err;
    }
  }

  /** Current snapshot (in-memory). */
  list(): Gateway[] {
    return this.gateways;
  }

  get(id: string): Gateway | undefined {
    return this.gateways.find((g) => g.id === id);
  }

  /** Add a new gateway. Returns the updated list. */
  async add(gateway: Gateway): Promise<Gateway[]> {
    if (this.gateways.some((g) => g.id === gateway.id)) {
      throw new Error(`Gateway with id "${gateway.id}" already exists`);
    }
    this.gateways.push(gateway);
    await this.write();
    return this.gateways;
  }

  /** Update an existing gateway by id. Returns the updated list. */
  async update(id: string, patch: Partial<Gateway>): Promise<Gateway[]> {
    const idx = this.gateways.findIndex((g) => g.id === id);
    if (idx === -1) {
      throw new Error(`Gateway with id "${id}" not found`);
    }
    const existing = this.gateways[idx]!;
    this.gateways[idx] = { ...existing, ...patch, id: existing.id };
    await this.write();
    return this.gateways;
  }

  /** Remove a gateway by id. Returns the updated list. */
  async remove(id: string): Promise<Gateway[]> {
    const before = this.gateways.length;
    this.gateways = this.gateways.filter((g) => g.id !== id);
    if (this.gateways.length === before) {
      throw new Error(`Gateway with id "${id}" not found`);
    }
    await this.write();
    return this.gateways;
  }

  /**
   * Atomic write: write to .tmp, fsync, rename.
   * R1 mitigation; prevents corruption if process dies mid-write.
   */
  private async write(): Promise<void> {
    const tmpPath = `${this.filePath}.tmp`;
    const yamlText = SerializeYaml(this.gateways);
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const handle = await fs.open(tmpPath, 'w');
    try {
      await handle.writeFile(yamlText, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(tmpPath, this.filePath);
  }

  /**
   * Watch the file for external edits. Calls onReload on each debounced change.
   * Skips events that match the bytes we just wrote (self-write coalescing).
   */
  watch(onReload: (gateways: Gateway[]) => void, debounceMs: number): void {
    if (this.watcher) return;
    let timer: NodeJS.Timeout | null = null;
    let lastSelfWriteMtime = 0;

    // Track our own writes to ignore chokidar events immediately after.
    const origWrite = this.write.bind(this);
    this.write = async () => {
      const stat = await fs.stat(this.filePath).catch(() => null);
      lastSelfWriteMtime = stat?.mtimeMs ?? Date.now();
      return origWrite();
    };

    this.watcher = chokidar.watch(this.filePath, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: debounceMs, pollInterval: Math.max(50, debounceMs / 5) },
    });

    const handler = async () => {
      const stat = await fs.stat(this.filePath).catch(() => null);
      const mtime = stat?.mtimeMs ?? 0;
      // Coalesce self-write (within 200ms of our last write).
      if (Math.abs(mtime - lastSelfWriteMtime) < 200) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          await this.load();
          onReload(this.gateways);
        } catch (err) {
          console.error('[yamlStore] reload failed:', err);
        }
      }, debounceMs);
    };

    this.watcher.on('change', handler);
    this.watcher.on('add', handler);
  }

  /** Stop watching. */
  async close(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }
}
