import Database from 'better-sqlite3';

// A monotonic generation counter stored in the fat DB's `meta` table, bumped on
// every publish. It's the guard against silently clobbering newer published
// work: publish refuses to overwrite a bucket fat DB with a higher generation,
// and restore refuses to keep a local DB that's behind the bucket. The same
// number is mirrored to a tiny file in storage (KEYS.dbFatGeneration) so both
// sides can compare without downloading the whole fat DB.

const KEY = 'generation';

/** Read the generation, or 0 if the DB predates the meta table / the key. */
export function readGeneration(dbPath: string): number {
  const sqlite = new Database(dbPath, { readonly: true });
  try {
    const row = sqlite
      .prepare('SELECT value FROM meta WHERE key = ?')
      .get(KEY) as { value: string } | undefined;
    return row ? Number(row.value) : 0;
  } catch {
    // `meta` table doesn't exist yet (DB written before this migration).
    return 0;
  } finally {
    sqlite.close();
  }
}

/** Increment and persist the generation, returning the new value. Creates the
 * `meta` table defensively so a fat DB restored from before this change can
 * still be published. */
export function bumpGeneration(dbPath: string): number {
  const sqlite = new Database(dbPath);
  try {
    sqlite.exec(
      'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
    );
    const row = sqlite
      .prepare('SELECT value FROM meta WHERE key = ?')
      .get(KEY) as { value: string } | undefined;
    const next = (row ? Number(row.value) : 0) + 1;
    sqlite
      .prepare(
        'INSERT INTO meta (key, value) VALUES (?, ?) ' +
          'ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      )
      .run(KEY, String(next));
    return next;
  } finally {
    sqlite.close();
  }
}
