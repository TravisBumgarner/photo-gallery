import fs from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { loadConfig } from './config.js';
import { summary } from './progress.js';
import { confirmTyped } from './prompt.js';
import { expandHome } from './util.js';

async function main() {
  const config = loadConfig();

  if (!config.DATABASE_URL) {
    console.error('Refusing to run: DATABASE_URL is not set in .cli-cache.');
    process.exit(1);
  }

  const dbFile = path.resolve(expandHome(config.DATABASE_URL));
  const destDir = path.resolve(expandHome(config.DESTINATION_DIRECTORY));
  const imagesDir = path.join(destDir, 'images');
  const thumbnailsDir = path.join(destDir, 'thumbnails');
  const dbName = path.basename(dbFile);

  console.log('=========================================================');
  console.log('  DESTRUCTIVE: clear local database and images');
  console.log('=========================================================');
  console.log('  Will delete:');
  console.log(`    - ${dbFile}`);
  console.log(`    - ${imagesDir}`);
  console.log(`    - ${thumbnailsDir}`);
  console.log('  Then recreate empty image dirs and re-run migrations.');
  console.log('=========================================================\n');

  // The orchestrator's "Create" choice is the confirmation; skip the typed
  // prompt when invoked non-interactively (OP_FORCE=1).
  if (process.env.OP_FORCE !== '1') {
    const confirmed = await confirmTyped(
      `Type the DB filename (${dbName}) to confirm: `,
      dbName,
    );
    if (!confirmed) {
      console.error('Confirmation did not match. Aborting.');
      process.exit(1);
    }
  }

  console.log('\nClearing local state...');
  await fs.rm(dbFile, { force: true });
  await fs.rm(imagesDir, { recursive: true, force: true });
  await fs.rm(thumbnailsDir, { recursive: true, force: true });
  await fs.mkdir(imagesDir, { recursive: true });
  await fs.mkdir(thumbnailsDir, { recursive: true });

  console.log('\nRunning migrations to recreate empty schema...');
  // Apply the SQL migrations directly via drizzle-orm's migrator — no need for
  // drizzle-kit/esbuild, which keeps this working inside the cli container.
  const migrationsFolder = path.resolve('../backend/drizzle');
  const sqlite = new Database(dbFile);
  try {
    migrate(drizzle(sqlite), { migrationsFolder });
  } finally {
    sqlite.close();
  }
  console.log(`  Applied migrations from ${migrationsFolder}`);

  console.log(
    '\nDone. Restart the backend if it was running so its in-memory caches reset.',
  );
  summary('wiped — DB + images reset');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
