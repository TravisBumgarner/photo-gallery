import fs from 'node:fs/promises';
import path from 'node:path';
import type { StorageBackend } from './index.js';

/**
 * Local-directory backend. The degenerate case of the storage contract: the
 * "bucket" is a folder on disk. This is also the single-box / personal-hosting
 * mode — ingestion writes here, serving reads from the same dir.
 */
export class LocalStorage implements StorageBackend {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    return path.join(this.root, key);
  }

  async put(key: string, data: Buffer): Promise<void> {
    const dest = this.resolve(key);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, data);
  }

  async putFile(key: string, filePath: string): Promise<void> {
    const dest = this.resolve(key);
    if (path.resolve(dest) === path.resolve(filePath)) return; // already in place
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(filePath, dest);
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  async getToFile(key: string, destPath: string): Promise<void> {
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.copyFile(this.resolve(key), destPath);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  async copy(srcKey: string, destKey: string): Promise<void> {
    const dest = this.resolve(destKey);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(this.resolve(srcKey), dest);
  }

  async list(prefix: string): Promise<string[]> {
    const base = this.resolve(prefix);
    let entries: string[] = [];
    try {
      entries = await walk(base);
    } catch {
      return []; // missing prefix → empty
    }
    return entries.map((abs) => path.relative(this.root, abs));
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolve(key), { force: true, recursive: true });
  }
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  for (const d of dirents) {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}
