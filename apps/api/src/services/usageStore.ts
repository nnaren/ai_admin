import { promises as fs } from 'node:fs';
import path from 'node:path';
import { stringify as serializeYaml } from 'yaml';
import { loadYamlArray } from './yamlStore.js';
import type { UsageAccount } from '../types.js';

export class UsageStore {
  private accounts: UsageAccount[] = [];

  constructor(private readonly filePath: string) {}

  async load(): Promise<UsageAccount[]> {
    const accounts = await loadYamlArray<UsageAccount & { name?: string }>(this.filePath);
    this.accounts = accounts.map((account) => {
      const sanitized = { ...account };
      delete sanitized.name;
      return sanitized;
    });
    return this.accounts;
  }

  list(): UsageAccount[] {
    return this.accounts;
  }

  get(id: string): UsageAccount | undefined {
    return this.accounts.find((a) => a.id === id);
  }

  async add(account: UsageAccount): Promise<UsageAccount[]> {
    if (this.accounts.some((a) => a.id === account.id)) {
      throw new Error(`Account with id "${account.id}" already exists`);
    }
    this.accounts.push(account);
    await this.write();
    return this.accounts;
  }

  async update(id: string, patch: Partial<UsageAccount>): Promise<UsageAccount[]> {
    const idx = this.accounts.findIndex((a) => a.id === id);
    if (idx === -1) throw new Error(`Account with id "${id}" not found`);
    const existing = this.accounts[idx]!;
    const apiKey = patch.apiKey || existing.apiKey;
    this.accounts[idx] = { ...existing, ...patch, id: existing.id, apiKey };
    await this.write();
    return this.accounts;
  }

  async remove(id: string): Promise<UsageAccount[]> {
    const before = this.accounts.length;
    this.accounts = this.accounts.filter((a) => a.id !== id);
    if (this.accounts.length === before) throw new Error(`Account with id "${id}" not found`);
    await this.write();
    return this.accounts;
  }

  private async write(): Promise<void> {
    const tmpPath = `${this.filePath}.tmp`;
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const handle = await fs.open(tmpPath, 'w');
    try {
      await handle.writeFile(serializeYaml(this.accounts), 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(tmpPath, this.filePath);
  }
}
