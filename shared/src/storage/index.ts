/**
 * Pluggable storage backend shared by ingestion (write side) and serving
 * (read side). Ingestion publishes images, thumbnails, labels.json, the fat
 * ingestion DB, and the slim read-only DB here; serving reads them back.
 *
 * One implementation: a local directory (file://). The gallery serves
 * everything from one host's disk.
 */
export interface StorageBackend {
  /** Write raw bytes at `key` (creating any parent prefixes). */
  put(key: string, data: Buffer): Promise<void>;
  /** Stream a local file to `key` — for large objects (images) without buffering. */
  putFile(key: string, filePath: string): Promise<void>;
  /** Read the object at `key`. Rejects if it does not exist. */
  get(key: string): Promise<Buffer>;
  /** Download the object at `key` to a local path. */
  getToFile(key: string, destPath: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  /** Copy an existing object to another key (e.g. archiving the old DB). */
  copy(srcKey: string, destKey: string): Promise<void>;
  /** Keys under `prefix` (recursive), as storage keys (not local paths). */
  list(prefix: string): Promise<string[]>;
  delete(key: string): Promise<void>;
}

/** Canonical key layout in the backend. Both halves agree on these. */
export const KEYS = {
  image: (originalPath: string) => `images/${originalPath}`,
  thumbnail: (thumbnailPath: string) => thumbnailPath, // already "thumbnails/.."
  labels: () => 'labels.json',
  /** The fat ingestion DB (with embeddings) — the durable artifact a fresh
   * machine pulls to rebuild without re-running the vision models. */
  dbFat: () => 'db/ingest.sqlite',
  /** Archive of a previous fat DB, stamped with the publish version. */
  dbFatBackup: (version: string) => `db/backups/ingest-${version}.sqlite`,
  /** Versioned, immutable slim DB snapshots (embeddings stripped) for serving. */
  dbVersion: (version: string) => `db/prod-${version}.sqlite`,
  /** Pointer file holding the current version string. */
  dbLatest: () => 'db/latest',
} as const;

/**
 * Build a backend from a storage URL.
 *   file:///abs/path  or  /abs/path   -> local directory
 */
export async function createStorage(url: string): Promise<StorageBackend> {
  const root = url.startsWith('file://') ? url.slice('file://'.length) : url;
  const { LocalStorage } = await import('./local.js');
  return new LocalStorage(root);
}
