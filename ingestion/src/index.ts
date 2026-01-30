import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import readline from 'readline';
import { sql } from 'drizzle-orm';
import { createDb } from 'shared/db';
import { photos } from 'shared/db/schema';
import { config } from './config.js';
import { scanDirectory } from './scan.js';
import { processImage } from './process.js';
import { syncToRemote } from './sync.js';
import { endExiftool } from './exif.js';

const PARALLEL_BATCH_SIZE = 20;

const db = createDb(config.DATABASE_URL);

function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(`${message} (y/n) `, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

async function main() {
  const mode = config.INGEST_MODE;
  const rawSourceDir = config.SOURCE_DIR;
  const sourceDir = rawSourceDir.startsWith('~')
    ? path.join(os.homedir(), rawSourceDir.slice(1))
    : rawSourceDir;
  const sshHost = config.SSH_HOST;
  const sshDestDir = config.SSH_DEST_DIR;

  if (mode === 'production' && (!sshHost || !sshDestDir)) {
    console.error('Production mode requires SSH_HOST and SSH_DEST_DIR env vars');
    process.exit(1);
  }

  const outputDir = path.resolve('../backend/public/images');
  const thumbnailDir = path.resolve('../backend/public/thumbnails');

  const dryRun = config.DRY_RUN === 'true';

  console.log('--- Photo Ingestion ---\n');
  console.log(`  Mode:     ${mode}`);
  console.log(`  Dry run:  ${dryRun}`);
  console.log(`  Source:   ${sourceDir}`);
  console.log(`  Output:   ${outputDir}`);
  if (mode === 'production') {
    console.log(`  Sync:     ${sshHost}:${sshDestDir}`);
  } else {
    console.log(`  Sync:     skipped (local mode)`);
  }
  console.log();

  const ok = await confirm('Proceed with ingestion?');
  if (!ok) {
    console.log('Aborted.');
    process.exit(0);
  }

  // Scan for images
  console.log('\nScanning for images...');
  const imagePaths = await scanDirectory(sourceDir);
  console.log(`Found ${imagePaths.length} images\n`);

  if (imagePaths.length === 0) {
    console.log('No images found in SOURCE_DIR.');
  } else if (dryRun) {
    console.log('Files that would be processed:\n');
    for (const imagePath of imagePaths) {
      console.log(`  ${imagePath}`);
    }
    console.log(`\nTotal: ${imagePaths.length} files`);
  } else {
    // Create directories
    await fs.mkdir(outputDir, { recursive: true });
    await fs.mkdir(thumbnailDir, { recursive: true });

    // Process images in parallel batches
    let processed = 0;
    let failed = 0;
    const startTime = Date.now();

    for (let i = 0; i < imagePaths.length; i += PARALLEL_BATCH_SIZE) {
      const batch = imagePaths.slice(i, i + PARALLEL_BATCH_SIZE);
      const batchNum = Math.floor(i / PARALLEL_BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(imagePaths.length / PARALLEL_BATCH_SIZE);

      console.log(`\nBatch ${batchNum}/${totalBatches} (${i + 1}-${Math.min(i + batch.length, imagePaths.length)}/${imagePaths.length})`);

      const results = await Promise.allSettled(
        batch.map(imagePath => processImage(imagePath, sourceDir, outputDir, thumbnailDir))
      );

      results.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          processed++;
        } else {
          failed++;
          console.error(`  Failed: ${path.basename(batch[idx])} - ${result.reason}`);
        }
      });

      const elapsed = (Date.now() - startTime) / 1000;
      const rate = processed / elapsed;
      const remaining = imagePaths.length - (i + batch.length);
      const eta = remaining / rate;
      console.log(`  Progress: ${processed} processed, ${failed} failed | ${rate.toFixed(1)} img/sec | ETA: ${Math.ceil(eta)}s`);
    }

    const totalTime = (Date.now() - startTime) / 1000;
    console.log('\nProcessing complete!');
    console.log(`   Processed: ${processed}`);
    console.log(`   Failed: ${failed}`);
    console.log(`   Total time: ${Math.ceil(totalTime)}s (${(processed / totalTime).toFixed(1)} images/sec)`);
  }

  await endExiftool();

  // DB sync: remove stale rows that have no corresponding file on disk
  console.log('\nSyncing DB with images on disk...');
  try {
    await fs.mkdir(outputDir, { recursive: true });
    const filesOnDisk = await fs.readdir(outputDir);
    const uuidsOnDisk = new Set(
      filesOnDisk.map(f => path.basename(f, path.extname(f)))
    );

    const dbRows = await db.select({ uuid: photos.uuid }).from(photos);
    const dbUuids = dbRows.map(row => row.uuid);

    let staleRemoved = 0;
    for (const uuid of dbUuids) {
      if (!uuidsOnDisk.has(uuid)) {
        await db.delete(photos).where(sql`${photos.uuid} = ${uuid}`);
        console.log(`  Removed stale DB row: ${uuid}`);
        staleRemoved++;
      }
    }

    console.log(`  DB rows: ${dbUuids.length}, Images on disk: ${uuidsOnDisk.size}, Stale rows removed: ${staleRemoved}`);
  } catch (err) {
    console.error('  DB sync failed:', err);
  }

  // Rsync to remote only in production mode
  if (mode === 'production') {
    const publicDir = path.resolve('./public');
    syncToRemote(path.join(publicDir, 'images'), sshHost!, path.join(sshDestDir!, 'images'));
    syncToRemote(path.join(publicDir, 'thumbnails'), sshHost!, path.join(sshDestDir!, 'thumbnails'));
  } else {
    console.log('\nLocal mode — skipping rsync.');
  }
}

main().catch((error) => {
  console.error('Error:', error);
  endExiftool();
  process.exit(1);
});
