import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { loadConfig } from './config.js';
import { MIGRATIONS_DIR, readMigrationStatus } from './migration-status.js';
import { summary } from './progress.js';
import { expandHome } from './util.js';

// Idempotent: ensure the ingest DB exists with the current schema. Run before
// ingest so a fresh DB has tables (drizzle skips already-applied migrations).
const config = loadConfig();
if (!config.DATABASE_URL) {
  console.error('Refusing to run: DATABASE_URL is not set in .cli-cache.');
  process.exit(1);
}

const dbPath = path.resolve(expandHome(config.DATABASE_URL));
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

// A restored backup can carry a DB at a different schema version than this code.
const status = readMigrationStatus(dbPath);
if (status.state === 'ahead') {
  // No down-migrations exist — a DB ahead of the code can't be reconciled here.
  console.error(
    `Refusing to migrate: this database was written by a NEWER version of the ` +
      `code (${status.applied} migrations applied; this code ships ${status.available}). ` +
      `Update the CLI/code to a version that includes the newer migrations, then retry.`,
  );
  summary('DB newer than code — aborted');
  process.exit(1);
}
// Migrations are one-way; keep a single rollback copy before changing the schema.
if (status.pending.length > 0 && fs.existsSync(dbPath)) {
  fs.copyFileSync(dbPath, `${dbPath}.pre-migrate`);
  console.log(`Snapshot saved before migrating: ${dbPath}.pre-migrate`);
}

const sqlite = new Database(dbPath);
migrate(drizzle(sqlite), {
  migrationsFolder: MIGRATIONS_DIR,
});
sqlite.close();
console.log(`Database ready: ${dbPath}`);
summary('schema ready');
