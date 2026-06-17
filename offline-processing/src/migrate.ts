import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { loadConfig } from './config.js';
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

const sqlite = new Database(dbPath);
migrate(drizzle(sqlite), {
  migrationsFolder: path.resolve('../backend/drizzle'),
});
sqlite.close();
console.log(`Database ready: ${dbPath}`);
summary('schema ready');
