import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { sql } from 'drizzle-orm';
import { photos } from 'shared/db/schema';

dotenv.config();

interface ManifestRecord {
  uuid: string;
  filename: string;
  originalPath: string;
  thumbnailPath: string;
  blurhash: string;
  width: number;
  height: number;
  aspectRatio: number;
  fileSize: number;
  mimeType: string;
  camera: string | null;
  lens: string | null;
  dateCaptured: string | null;
  iso: number | null;
  shutterSpeed: string | null;
  aperture: number | null;
  focalLength: number | null;
  rating: number | null;
  label: string | null;
  keywords: string | null;
}

const MANIFEST_PATH = path.resolve('manifest.json');
const IMAGES_DIR = path.resolve('public/images');

async function main() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error(`Manifest not found: ${MANIFEST_PATH}`);
    process.exit(1);
  }

  const sqlite = new Database(process.env.DATABASE_URL || 'sqlite.db');
  const db = drizzle(sqlite);

  const raw = fs.readFileSync(MANIFEST_PATH, 'utf-8');
  const records: ManifestRecord[] = JSON.parse(raw);
  console.log(`Ingesting ${records.length} records from manifest...`);

  for (const record of records) {
    const { uuid, dateCaptured: dateStr, ...fields } = record;
    const dateCaptured = dateStr ? new Date(dateStr) : null;

    const existing = await db
      .select()
      .from(photos)
      .where(sql`${photos.uuid} = ${uuid}`)
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(photos)
        .set({ ...fields, dateCaptured, updatedAt: new Date() })
        .where(sql`${photos.uuid} = ${uuid}`);
    } else {
      await db.insert(photos).values({ uuid, ...fields, dateCaptured });
    }
  }

  console.log('Upsert complete.');

  // Remove stale DB rows that have no corresponding image on disk
  console.log('Syncing DB with images on disk...');
  const filesOnDisk = fs.readdirSync(IMAGES_DIR);
  const uuidsOnDisk = new Set(
    filesOnDisk.map((f) => path.basename(f, path.extname(f))),
  );

  const dbRows = await db.select({ uuid: photos.uuid }).from(photos);
  let staleRemoved = 0;
  for (const row of dbRows) {
    if (!uuidsOnDisk.has(row.uuid)) {
      await db.delete(photos).where(sql`${photos.uuid} = ${row.uuid}`);
      console.log(`  Removed stale row: ${row.uuid}`);
      staleRemoved++;
    }
  }
  console.log(
    `DB rows: ${dbRows.length}, Images on disk: ${uuidsOnDisk.size}, Stale removed: ${staleRemoved}`,
  );

  // Clean up manifest
  fs.unlinkSync(MANIFEST_PATH);
  console.log('Manifest deleted.');

  sqlite.close();
  console.log('Done.');
}

main().catch((err) => {
  console.error('Manifest ingestion failed:', err);
  process.exit(1);
});
