import path from 'node:path';
import readline from 'node:readline';
import { loadConfig } from './config.js';
import { syncFileToRemote } from './sync.js';

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

  if (!config.SSH_HOST) {
    console.error('Refusing to run: SSH_HOST is not set in .env.production.');
    process.exit(1);
  }
  if (!config.DATABASE_URL) {
    console.error('DATABASE_URL must be set (path to local sqlite).');
    process.exit(1);
  }

  const sshHost = config.SSH_HOST;
  const destDir = config.DESTINATION_DIRECTORY;
  const localDbPath = path.resolve(config.DATABASE_URL);
  const remoteDbPath = path.posix.join(destDir, 'sqlite.db');

  console.log('--- Sync DB to production ---');
  console.log(`  Host:  ${sshHost}`);
  console.log(`  DB:    ${localDbPath} -> ${remoteDbPath}`);
  console.log(
    '\n  NOTE: stop the prod backend before syncing to avoid SQLite write races.',
  );

  const ok = await prompt('\nProceed? (y/n) ');
  if (ok.trim().toLowerCase() !== 'y') {
    console.log('Aborted.');
    process.exit(0);
  }

  syncFileToRemote(localDbPath, sshHost, remoteDbPath);

  console.log(
    '\nDone. Restart the backend on the host so its in-memory caches reset.',
  );
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
