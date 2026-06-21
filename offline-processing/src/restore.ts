import { existsSync } from 'node:fs';
import path from 'node:path';
import { createStorage, KEYS } from 'shared/storage';
import { loadConfig, storageUrl } from './config.js';
import { summary } from './progress.js';
import { expandHome } from './util.js';

// Seed the working ingestion DB from the published fat DB when it's missing —
// i.e. a fresh or wiped machine that just pulled data/out. With the fat DB in
// hand, the expensive compute (tags, embeddings, detections) is already there;
// re-ingest only appends new photos. No-op when a working DB already exists
// (it's the local source of truth) or when there's no published DB yet.
async function main() {
  const config = loadConfig();
  if (!config.DATABASE_URL) {
    console.error('Refusing to run: DATABASE_URL is not set in .cli-cache.');
    process.exit(1);
  }
  const dbPath = path.resolve(expandHome(config.DATABASE_URL));

  if (existsSync(dbPath)) {
    console.log(`Working database already present at ${dbPath} — keeping it.`);
    summary('using existing database');
    return;
  }

  const storage = await createStorage(storageUrl(config));
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
