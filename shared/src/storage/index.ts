/**
 * Pluggable storage backend shared by ingestion (write side) and serving
 * (read side). Ingestion publishes images, thumbnails, per-photo sidecars,
 * labels.json, and the read-only DB here; serving reads them back.
 *
 * Today there is one implementation (local directory). An S3-compatible
 * backend drops in behind the same interface without touching either half.
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
  /** Keys under `prefix` (recursive), as storage keys (not local paths). */
  list(prefix: string): Promise<string[]>;
  delete(key: string): Promise<void>;
}

/** Canonical key layout in the backend. Both halves agree on these. */
export const KEYS = {
  image: (originalPath: string) => `images/${originalPath}`,
  thumbnail: (thumbnailPath: string) => thumbnailPath, // already "thumbnails/.."
  sidecar: (contentHash: string) => `sidecars/${contentHash}.json`,
  labels: () => 'labels.json',
  /** Versioned, immutable read-only DB snapshots. */
  dbVersion: (version: string) => `db/prod-${version}.sqlite`,
  /** Pointer file holding the current version string. */
  dbLatest: () => 'db/latest',
} as const;

/**
 * Build a backend from a storage URL.
 *   file:///abs/path  or  /abs/path   -> local directory
 *   s3://bucket/prefix                 -> (not yet) S3-compatible
 */
export async function createStorage(url: string): Promise<StorageBackend> {
  if (url.startsWith('s3://')) {
    const withoutScheme = url.slice('s3://'.length);
    const slash = withoutScheme.indexOf('/');
    const bucket = slash === -1 ? withoutScheme : withoutScheme.slice(0, slash);
    const prefix = slash === -1 ? '' : withoutScheme.slice(slash + 1);
    const { S3Storage } = await import('./s3.js');
    return new S3Storage(bucket, prefix);
  }
  const root = url.startsWith('file://') ? url.slice('file://'.length) : url;
  const { LocalStorage } = await import('./local.js');
  return new LocalStorage(root);
}
