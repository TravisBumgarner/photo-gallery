import fs from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { createDb } from 'shared/db';
import { photos } from 'shared/db/schema';
import { loadConfig, STAGING_DIR } from '@/config.js';
import { endExiftool } from '@/exif.js';
import type { PhotoRecord } from '@/process.js';
import { processImage } from '@/process.js';
import { status, summary } from '@/progress.js';
import { confirm } from '@/prompt.js';
import { scanDirectory } from '@/scan.js';
import { settings } from '@/settings.js';

const PARALLEL_BATCH_SIZE = settings.ingest.batchSize;

async function main() {
  const config = loadConfig();

  const sourceDir = STAGING_DIR;
  const destinationDir = config.DESTINATION_DIRECTORY;

  if (!config.DATABASE_URL) {
    console.error('DATABASE_URL env var is required');
    process.exit(1);
  }
  const databaseUrl = config.DATABASE_URL;

  const localImageRoot = path.resolve(destinationDir);
  const outputDir = path.join(localImageRoot, 'images');
  const thumbnailDir = path.join(localImageRoot, 'thumbnails');

  const dryRun = config.DRY_RUN === 'true';
  const fileTransferMode = config.FILE_TRANSFER_MODE;

  console.log('--- Photo Ingestion ---\n');
  console.log(`  Transfer: ${fileTransferMode}`);
  console.log(`  Dry run:  ${dryRun}`);
  console.log(`  Source:   ${sourceDir}`);
  console.log(`  Output:   ${outputDir}`);
  console.log();

  const ok = await confirm('Proceed with ingestion?');
  if (!ok) {
    console.log('Aborted.');
    process.exit(0);
  }

  // Create output + staging directories (staging may not exist yet on a fresh
  // checkout — manual ingestion drops photos into it).
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(thumbnailDir, { recursive: true });
  await fs.mkdir(sourceDir, { recursive: true });

  // Scan for images
  console.log('\nScanning for images...');
  // Start over re-ingests the archived originals too (the library is the source
  // of truth for a rebuild); normal runs skip the archive.
  const includeArchive = process.env.INGEST_INCLUDE_ARCHIVE === '1';
  const imagePaths = await scanDirectory(sourceDir, includeArchive);
  console.log(`Found ${imagePaths.length} images\n`);

  const records: PhotoRecord[] = [];

  if (imagePaths.length === 0) {
    console.log(`No images found in staging (${sourceDir}).`);
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
          processImage(
            imagePath,
            sourceDir,
            outputDir,
            thumbnailDir,
            fileTransferMode,
          ),
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
      status(
        `${processed + failed} / ${imagePaths.length} photos · ${rate.toFixed(1)} img/s · ETA ${Math.ceil(eta)}s`,
      );
    }

    const totalTime = (Date.now() - startTime) / 1000;
    console.log('\nProcessing complete!');
    console.log(`   Processed: ${processed}`);
    console.log(`   Failed: ${failed}`);
    console.log(
      `   Total time: ${Math.ceil(totalTime)}s (${(processed / totalTime).toFixed(1)} images/sec)`,
    );
    summary(
      `${processed.toLocaleString()} ingested${failed ? ` · ${failed} failed` : ''}`,
    );
  }

  await endExiftool();

  const db = createDb(path.resolve(databaseUrl));
  await upsertRecordsToLocalDb(db, records);
  await cleanupStaleLocalRows(db, outputDir);
}

async function upsertRecordsToLocalDb(
  db: ReturnType<typeof createDb>,
  records: PhotoRecord[],
) {
  const totalBefore = (
    await db.select({ count: sql<number>`count(*)` }).from(photos)
  )[0].count;

  if (records.length === 0) {
    console.log(`\nLocal DB: ${totalBefore} rows (no new records this run).`);
    return;
  }

  console.log('\nUpserting records into local DB...');
  let inserted = 0;
  let updated = 0;
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
      updated++;
    } else {
      await db.insert(photos).values({ uuid, ...fields });
      inserted++;
    }
  }

  const totalAfter = (
    await db.select({ count: sql<number>`count(*)` }).from(photos)
  )[0].count;

  console.log(
    `  Local DB: ${totalBefore} -> ${totalAfter} rows (${inserted} new, ${updated} updated)`,
  );
}

async function cleanupStaleLocalRows(
  db: ReturnType<typeof createDb>,
  outputDir: string,
) {
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
}

main().catch((error) => {
  console.error('Error:', error);
  endExiftool();
  process.exit(1);
});
