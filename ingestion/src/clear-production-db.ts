import path from 'node:path';
import readline from 'node:readline';
import { loadConfig } from './config.js';
import { runRemoteCommand } from './sync.js';

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
  const config = loadConfig('production');

  if (config.INGEST_MODE !== 'production') {
    console.error(
      `Refusing to run: INGEST_MODE in .env.production is "${config.INGEST_MODE}", expected "production".`,
    );
    process.exit(1);
  }
  if (!config.SSH_HOST) {
    console.error('Refusing to run: SSH_HOST is not set in .env.production.');
    process.exit(1);
  }

  const sshHost = config.SSH_HOST;
  const destDir = config.DESTINATION_DIRECTORY;
  const dbFile = path.posix.join(destDir, 'sqlite.db');
  const imagesDir = path.posix.join(destDir, 'public/images');
  const thumbnailsDir = path.posix.join(destDir, 'public/thumbnails');

  console.log('=========================================================');
  console.log('  DESTRUCTIVE: clear production database and images');
  console.log('=========================================================');
  console.log(`  Host:        ${sshHost}`);
  console.log(`  Dest dir:    ${destDir}`);
  console.log('  Will delete:');
  console.log(`    - ${dbFile}`);
  console.log(`    - ${imagesDir}`);
  console.log(`    - ${thumbnailsDir}`);
  console.log('  Then recreate empty image dirs and re-run migrations.');
  console.log('=========================================================\n');

  const typed = await prompt(`Type the SSH host name (${sshHost}) to confirm: `);
  if (typed.trim() !== sshHost) {
    console.error('Confirmation did not match. Aborting.');
    process.exit(1);
  }

  console.log('\nClearing remote state...');
  runRemoteCommand(
    sshHost,
    `rm -f ${dbFile} && rm -rf ${imagesDir} ${thumbnailsDir} && mkdir -p ${imagesDir} ${thumbnailsDir}`,
  );

  console.log('\nRunning migrations to recreate empty schema...');
  runRemoteCommand(sshHost, `cd ${destDir} && node dist/db/migrate.js`);

  console.log(
    '\nDone. Restart the backend on the host so its in-memory caches reset.',
  );
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
