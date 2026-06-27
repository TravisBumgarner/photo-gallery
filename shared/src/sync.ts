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
/** Parallel uploads in flight. Bounded so a 50k-photo first sync doesn't open
 * tens of thousands of file handles at once. */
const UPLOAD_CONCURRENCY = 8;

export async function syncMediaToStorage(
  storage: StorageBackend,
  mediaDir: string,
  onProgress?: (done: number, total: number) => void,
): Promise<SyncMediaResult> {
  // One recursive list() per prefix to learn what's already in the backend,
  // instead of a blocking exists() per file (~100k sequential stats at 50k
  // photos, even when nothing is new). Files are immutable + content-addressed,
  // so set membership is a sufficient skip test.
  const files: string[] = [];
  const present = new Set<string>();
  for (const sub of ['images', 'thumbnails']) {
    files.push(...(await walk(path.join(mediaDir, sub))));
    for (const key of await storage.list(sub)) present.add(key);
  }

  const toUpload: Array<{ key: string; abs: string }> = [];
  let skipped = 0;
  for (const abs of files) {
    const key = path.relative(mediaDir, abs); // e.g. images/uuid.jpg
    if (present.has(key)) skipped++;
    else toUpload.push({ key, abs });
  }

  const result: SyncMediaResult = { uploaded: 0, skipped };
  const total = files.length;
  let done = skipped;
  onProgress?.(done, total);

  // Bounded worker pool over the new files. Single-threaded JS makes the shared
  // counter/cursor increments safe across the awaiting workers.
  let cursor = 0;
  const worker = async () => {
    while (cursor < toUpload.length) {
      const { key, abs } = toUpload[cursor++];
      await storage.putFile(key, abs);
      result.uploaded++;
      onProgress?.(++done, total);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(UPLOAD_CONCURRENCY, toUpload.length) }, worker),
  );
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
