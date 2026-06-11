import path from 'node:path';
import { imagesDir, loadConfig, thumbnailsDir } from './config.js';
import { confirm } from './prompt.js';
import { syncToRemote } from './sync.js';

async function main() {
  const config = loadConfig('production');

  if (!config.SSH_HOST) {
    console.error('Refusing to run: SSH_HOST is not set in .env.production.');
    process.exit(1);
  }

  const sshHost = config.SSH_HOST;
  const destDir = config.DESTINATION_DIRECTORY;
  const localImagesDir = imagesDir(config);
  const localThumbnailsDir = thumbnailsDir(config);
  const remoteImagesDir = path.posix.join(destDir, 'public/images');
  const remoteThumbnailsDir = path.posix.join(destDir, 'public/thumbnails');

  console.log('--- Sync images to production ---');
  console.log(`  Host:        ${sshHost}`);
  console.log(`  Images:      ${localImagesDir} -> ${remoteImagesDir}`);
  console.log(`  Thumbnails:  ${localThumbnailsDir} -> ${remoteThumbnailsDir}`);
  console.log('\n  Will --delete remote files not present locally.');

  if (!(await confirm('\nProceed?'))) {
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
