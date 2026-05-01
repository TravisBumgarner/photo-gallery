import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { loadConfig } from './config.js';
import { expandHome } from './exported-helpers.js';

function prompt(message: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  const config = loadConfig('local');

  if (config.INGEST_MODE !== 'local') {
    console.error(
      `Refusing to run: INGEST_MODE in .env.local is "${config.INGEST_MODE}", expected "local".`,
    );
    process.exit(1);
  }
  if (!config.DATABASE_URL) {
    console.error('Refusing to run: DATABASE_URL is not set in .env.local.');
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

  const typed = await prompt(`Type the DB filename (${dbName}) to confirm: `);
  if (typed.trim() !== dbName) {
    console.error('Confirmation did not match. Aborting.');
    process.exit(1);
  }

  console.log('\nClearing local state...');
  await fs.rm(dbFile, { force: true });
  await fs.rm(imagesDir, { recursive: true, force: true });
  await fs.rm(thumbnailsDir, { recursive: true, force: true });
  await fs.mkdir(imagesDir, { recursive: true });
  await fs.mkdir(thumbnailsDir, { recursive: true });

  console.log('\nRunning migrations to recreate empty schema...');
  execSync('npm run db:migrate', {
    cwd: path.resolve('../backend'),
    stdio: 'inherit',
  });

  console.log(
    '\nDone. Restart the backend if it was running so its in-memory caches reset.',
  );
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
