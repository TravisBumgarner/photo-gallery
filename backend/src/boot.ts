import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createStorage, KEYS } from 'shared/storage';

// Load .env relative to this file (src/boot.ts or dist/boot.js → ../.env), not
// the cwd — so it works whether run from the app dir or anywhere else. None of
// the imports above read env at load time, so loading it here is in time.
dotenv.config({
  path: path.join(path.dirname(fileURLToPath(import.meta.url)), '../.env'),
});

/**
 * Boot-time DB pull. Runs as a separate step *before* `node dist/index.js`,
 * because the route modules open the DB at import time — so the read-only
 * snapshot must already be on local disk by then.
 *
 * Pulls the `latest` slim DB from the storage backend to DATABASE_URL. To
 * publish a library update, re-ingest + publish, then restart the container.
 * If STORAGE_URL is unset (local dev), the existing DATABASE_URL is used as-is.
 */
async function main() {
  const storageUrl = process.env.STORAGE_URL;
  const dbPath = process.env.DATABASE_URL;

  if (!storageUrl) {
    console.log('boot: STORAGE_URL unset — using DATABASE_URL as-is.');
    return;
  }
  if (!dbPath) {
    console.error('boot: DATABASE_URL is required to pull the read-only DB.');
    process.exit(1);
  }

  const storage = await createStorage(storageUrl);
  if (!(await storage.exists(KEYS.dbLatest()))) {
    console.error(
      `boot: no ${KEYS.dbLatest()} in ${storageUrl} — run \`publish\` first.`,
    );
    process.exit(1);
  }

  const version = (await storage.get(KEYS.dbLatest())).toString().trim();
  console.log(`boot: pulling read-only DB ${version} -> ${dbPath}`);
  await storage.getToFile(KEYS.dbVersion(version), dbPath);
  console.log('boot: DB ready.');
}

main().catch((err) => {
  console.error('boot failed:', err);
  process.exit(1);
});
