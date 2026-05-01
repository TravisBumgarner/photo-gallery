import path from 'node:path';
import readline from 'node:readline';
import { loadConfig } from './config.js';
import { syncToRemote } from './sync.js';

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

  const sshHost = config.SSH_HOST;
  const destDir = config.DESTINATION_DIRECTORY;
  const localImagesDir = path.resolve('../backend/public/images');
  const localThumbnailsDir = path.resolve('../backend/public/thumbnails');
  const remoteImagesDir = path.posix.join(destDir, 'public/images');
  const remoteThumbnailsDir = path.posix.join(destDir, 'public/thumbnails');

  console.log('--- Sync images to production ---');
  console.log(`  Host:        ${sshHost}`);
  console.log(`  Images:      ${localImagesDir} -> ${remoteImagesDir}`);
  console.log(`  Thumbnails:  ${localThumbnailsDir} -> ${remoteThumbnailsDir}`);
  console.log('\n  Will --delete remote files not present locally.');

  const ok = await prompt('\nProceed? (y/n) ');
  if (ok.trim().toLowerCase() !== 'y') {
    console.log('Aborted.');
    process.exit(0);
  }

  syncToRemote(localImagesDir, sshHost, remoteImagesDir, { delete: true });
  syncToRemote(localThumbnailsDir, sshHost, remoteThumbnailsDir, {
    delete: true,
  });

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
