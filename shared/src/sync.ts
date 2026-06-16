import fs from 'node:fs/promises';
import path from 'node:path';
import type { StorageBackend } from './storage/index.js';

export interface SyncMediaResult {
  uploaded: number;
  skipped: number;
}

/**
 * Push media (images + thumbnails) from a local directory to the storage
 * backend. Files are immutable and content-addressed, so already-present keys
 * are skipped — re-syncs only upload new photos. Use after `publish` (which
 * handles the derived artifacts) to complete a sync-to-bucket.
 */
export async function syncMediaToStorage(
  storage: StorageBackend,
  mediaDir: string,
  onProgress?: (done: number, total: number) => void,
): Promise<SyncMediaResult> {
  const files: string[] = [];
  for (const sub of ['images', 'thumbnails']) {
    files.push(...(await walk(path.join(mediaDir, sub))));
  }

  const result: SyncMediaResult = { uploaded: 0, skipped: 0 };
  let done = 0;
  for (const abs of files) {
    const key = path.relative(mediaDir, abs); // e.g. images/uuid.jpg
    if (await storage.exists(key)) {
      result.skipped++;
    } else {
      await storage.putFile(key, abs);
      result.uploaded++;
    }
    onProgress?.(++done, files.length);
  }
  return result;
}

async function walk(dir: string): Promise<string[]> {
  // Missing dir → nothing to sync.
  const entries = await fs
    .readdir(dir, { withFileTypes: true })
    .catch(() => []);
  const out: string[] = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}
