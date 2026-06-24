import { existsSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { readGeneration } from 'shared/db/generation';
import { createStorage, KEYS } from 'shared/storage';
import { loadConfig, storageUrl } from './config.js';
import { summary } from './progress.js';
import { expandHome } from './util.js';

// A local DB only counts as "present" for seeding if it actually holds photos.
// A missing file — but also a zero-byte/corrupt/zero-row `ingest.sqlite` left by
// an aborted earlier run — must NOT short-circuit the restore, or re-ingest
// reprocesses every photo through the vision models (the exact cost restore
// exists to avoid). Defensive like readGeneration: any open/query failure → not
// usable.
function hasUsablePhotos(dbPath: string): boolean {
  if (!existsSync(dbPath)) return false;
  let sqlite: Database.Database | undefined;
  try {
    sqlite = new Database(dbPath, { readonly: true });
    const row = sqlite.prepare('SELECT count(*) AS n FROM photos').get() as {
      n: number;
    };
    return row.n > 0;
  } catch {
    return false;
  } finally {
    sqlite?.close();
  }
}

// Seed the working ingestion DB from the published fat DB when it's missing —
// i.e. a fresh or wiped machine that just pulled data/out. With the fat DB in
// hand, the expensive compute (tags, embeddings, detections) is already there;
// re-ingest only appends new photos. No-op when a working DB already exists
// (it's the local source of truth) or when there's no published DB yet.
//
// Guard: if a local DB exists but the bucket's fat DB is a newer generation,
// keeping local would silently drop published work — so refuse loudly rather
// than either keeping stale local or clobbering it. The operator resolves it.
async function main() {
  const config = loadConfig();
  if (!config.DATABASE_URL) {
    console.error('Refusing to run: DATABASE_URL is not set in .cli-cache.');
    process.exit(1);
  }
  const dbPath = path.resolve(expandHome(config.DATABASE_URL));
  const storage = await createStorage(storageUrl(config));

  async function remoteGeneration(): Promise<number | null> {
    if (!(await storage.exists(KEYS.dbFatGeneration()))) return null;
    const value = Number(
      (await storage.get(KEYS.dbFatGeneration())).toString().trim(),
    );
    return Number.isFinite(value) ? value : null;
  }

  if (hasUsablePhotos(dbPath)) {
    const remoteGen = await remoteGeneration();
    const localGen = readGeneration(dbPath);
    if (remoteGen != null && remoteGen > localGen) {
      console.error(
        `Refusing to continue: bucket fat DB is newer (generation ${remoteGen}) ` +
          `than the local working DB (generation ${localGen}). The local DB is ` +
          `behind published work. Move/delete ${dbPath} to restore the bucket ` +
          `copy, or reconcile manually.`,
      );
      summary('local DB behind bucket — aborted');
      process.exit(1);
    }
    console.log(`Working database already present at ${dbPath} — keeping it.`);
    summary('using existing database');
    return;
  }

  if (!(await storage.exists(KEYS.dbFat()))) {
    console.log('No published database to restore — starting fresh.');
    summary('no backup — starting fresh');
    return;
  }

  console.log(`Restoring database from backup → ${dbPath}`);
  await storage.getToFile(KEYS.dbFat(), dbPath);
  console.log('Database restored. Re-ingest will only process new photos.');
  summary('database restored from backup');
}

main().catch((err) => {
  console.error('Restore failed:', err);
  process.exit(1);
});
