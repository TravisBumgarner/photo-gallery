import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { sql } from 'drizzle-orm';
import { createDb } from 'shared/db';
import { photos } from 'shared/db/schema';
import { loadConfig } from '@/config.js';
import { endExiftool } from '@/exif.js';
import { processImage } from '@/process.js';
import type { PhotoRecord } from '@/process.js';
import { scanDirectory } from '@/scan.js';
import {
  runRemoteCommand,
  syncFileToRemote,
  syncToRemote,
} from '@/sync.js';

const PARALLEL_BATCH_SIZE = 20;

function prompt(message: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function confirm(message: string): Promise<boolean> {
  const answer = await prompt(`${message} (y/n) `);
  return answer === 'y';
}

async function chooseEnv(): Promise<'local' | 'production'> {
  const arg = process.argv[2];
  if (arg === 'local' || arg === 'production') {
    return arg;
  }

  const answer = await prompt('Environment (local/production): ');
  if (answer === 'local' || answer === 'production') {
    return answer;
  }

  console.error('Invalid environment. Must be "local" or "production".');
  process.exit(1);
}

async function main() {
  const env = await chooseEnv();
  const config = loadConfig(env);

  const mode = config.INGEST_MODE;
  const rawSourceDir = config.SOURCE_DIR;
  const sourceDir = rawSourceDir.startsWith('~')
    ? path.join(os.homedir(), rawSourceDir.slice(1))
    : rawSourceDir;
  const sshHost = config.SSH_HOST;
  const destinationDir = config.DESTINATION_DIRECTORY;

  const isProduction = mode === 'production';

  if (isProduction && !sshHost) {
    console.error('Production mode requires SSH_HOST env var');
    process.exit(1);
  }

  if (!isProduction && !config.DATABASE_URL) {
    console.error('Local mode requires DATABASE_URL env var');
    process.exit(1);
  }

  const localDir = isProduction
    ? path.resolve('.staging')
    : path.resolve(destinationDir);
  const outputDir = path.join(localDir, 'images');
  const thumbnailDir = path.join(localDir, 'thumbnails');

  const dryRun = config.DRY_RUN === 'true';
  const fileTransferMode = config.FILE_TRANSFER_MODE;

  console.log('--- Photo Ingestion ---\n');
  console.log(`  Mode:     ${mode}`);
  console.log(`  Transfer: ${fileTransferMode}`);
  console.log(`  Dry run:  ${dryRun}`);
  console.log(`  Source:   ${sourceDir}`);
  console.log(`  Output:   ${outputDir}`);
  if (isProduction) {
    console.log(`  Sync:     ${sshHost}:${destinationDir}`);
  } else {
    console.log(`  Sync:     skipped (local mode)`);
  }
  console.log();

  const ok = await confirm('Proceed with ingestion?');
  if (!ok) {
    console.log('Aborted.');
    process.exit(0);
  }

  // Create output directories
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(thumbnailDir, { recursive: true });

  // Scan for images
  console.log('\nScanning for images...');
  const imagePaths = await scanDirectory(sourceDir);
  console.log(`Found ${imagePaths.length} images\n`);

  let records: PhotoRecord[] = [];

  if (imagePaths.length === 0) {
    console.log('No images found in SOURCE_DIR.');
  } else if (dryRun) {
    console.log('Files that would be processed:\n');
    for (const imagePath of imagePaths) {
      console.log(`  ${imagePath}`);
    }
    console.log(`\nTotal: ${imagePaths.length} files`);
  } else {
    // Process images in parallel batches
    let processed = 0;
    let failed = 0;
    const startTime = Date.now();

    for (let i = 0; i < imagePaths.length; i += PARALLEL_BATCH_SIZE) {
      const batch = imagePaths.slice(i, i + PARALLEL_BATCH_SIZE);
      const batchNum = Math.floor(i / PARALLEL_BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(imagePaths.length / PARALLEL_BATCH_SIZE);

      console.log(
        `\nBatch ${batchNum}/${totalBatches} (${i + 1}-${Math.min(i + batch.length, imagePaths.length)}/${imagePaths.length})`,
      );

      const results = await Promise.allSettled(
        batch.map((imagePath) =>
          processImage(imagePath, sourceDir, outputDir, thumbnailDir, fileTransferMode),
        ),
      );

      results.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          processed++;
          records.push(result.value);
        } else {
          failed++;
          console.error(
            `  Failed: ${path.basename(batch[idx])} - ${result.reason}`,
          );
        }
      });

      const elapsed = (Date.now() - startTime) / 1000;
      const rate = processed / elapsed;
      const remaining = imagePaths.length - (i + batch.length);
      const eta = remaining / rate;
      console.log(
        `  Progress: ${processed} processed, ${failed} failed | ${rate.toFixed(1)} img/sec | ETA: ${Math.ceil(eta)}s`,
      );
    }

    const totalTime = (Date.now() - startTime) / 1000;
    console.log('\nProcessing complete!');
    console.log(`   Processed: ${processed}`);
    console.log(`   Failed: ${failed}`);
    console.log(
      `   Total time: ${Math.ceil(totalTime)}s (${(processed / totalTime).toFixed(1)} images/sec)`,
    );
  }

  await endExiftool();

  if (isProduction) {
    await runProductionSync(records, localDir, outputDir, thumbnailDir, sshHost!, destinationDir);
  } else {
    await runLocalDbSync(records, outputDir, config.DATABASE_URL!);
  }
}

async function runLocalDbSync(
  records: PhotoRecord[],
  outputDir: string,
  databaseUrl: string,
) {
  const db = createDb(path.resolve(databaseUrl));

  // Upsert photo records into local DB
  console.log('\nUpserting records into local DB...');
  for (const record of records) {
    const { uuid, ...fields } = record;
    const existing = await db
      .select()
      .from(photos)
      .where(sql`${photos.uuid} = ${uuid}`)
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(photos)
        .set({ ...fields, updatedAt: new Date() })
        .where(sql`${photos.uuid} = ${uuid}`);
    } else {
      await db.insert(photos).values({ uuid, ...fields });
    }
  }

  // DB sync: remove stale rows that have no corresponding file on disk
  console.log('\nSyncing DB with images on disk...');
  try {
    await fs.mkdir(outputDir, { recursive: true });
    const filesOnDisk = await fs.readdir(outputDir);
    const uuidsOnDisk = new Set(
      filesOnDisk.map((f) => path.basename(f, path.extname(f))),
    );

    const dbRows = await db.select({ uuid: photos.uuid }).from(photos);
    const dbUuids = dbRows.map((row) => row.uuid);

    let staleRemoved = 0;
    for (const uuid of dbUuids) {
      if (!uuidsOnDisk.has(uuid)) {
        await db.delete(photos).where(sql`${photos.uuid} = ${uuid}`);
        console.log(`  Removed stale DB row: ${uuid}`);
        staleRemoved++;
      }
    }

    console.log(
      `  DB rows: ${dbUuids.length}, Images on disk: ${uuidsOnDisk.size}, Stale rows removed: ${staleRemoved}`,
    );
  } catch (err) {
    console.error('  DB sync failed:', err);
  }

  console.log('\nLocal mode — skipping rsync.');
}

async function runProductionSync(
  records: PhotoRecord[],
  localDir: string,
  outputDir: string,
  thumbnailDir: string,
  sshHost: string,
  destinationDir: string,
) {
  // Write manifest with all photo metadata for remote DB ingestion
  const manifestPath = path.join(localDir, 'manifest.json');
  const serializable = records.map((r) => ({
    ...r,
    dateCaptured: r.dateCaptured ? r.dateCaptured.toISOString() : null,
  }));
  await fs.writeFile(manifestPath, JSON.stringify(serializable, null, 2));
  console.log(`\nWrote manifest with ${records.length} records.`);

  // Rsync images and thumbnails to remote
  syncToRemote(
    outputDir,
    sshHost,
    path.join(destinationDir, 'public/images'),
  );
  syncToRemote(
    thumbnailDir,
    sshHost,
    path.join(destinationDir, 'public/thumbnails'),
  );

  // Rsync manifest to remote
  syncFileToRemote(
    manifestPath,
    sshHost,
    path.join(destinationDir, 'manifest.json'),
  );

  // Run remote DB ingestion script
  runRemoteCommand(
    sshHost,
    `cd ${destinationDir} && node dist/db/ingest-manifest.js`,
  );

  // Clean up local staging
  console.log('\nCleaning up staging directory...');
  await fs.rm(localDir, { recursive: true, force: true });
  console.log('Staging directory removed.');
}

main().catch((error) => {
  console.error('Error:', error);
  endExiftool();
  process.exit(1);
});
