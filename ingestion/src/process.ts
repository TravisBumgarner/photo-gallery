import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { createDb } from 'shared/db';
import { photos } from 'shared/db/schema';
import sharp from 'sharp';
import { config } from '@/config.js';
import { extractExifData } from '@/exif.js';
import {
  approximateAspectRatio,
  createThumbnail,
  generateBlurhash,
} from '@/image.js';
import { deriveTagsFromPath } from '@/scan.js';

const db = createDb(config.DATABASE_URL);

function generateUUID(filename: string, dateCaptured: Date | null): string {
  const dateStr = dateCaptured ? dateCaptured.toISOString() : 'no-date';
  const uniqueString = `${filename}-${dateStr}`;
  return createHash('sha256')
    .update(uniqueString)
    .digest('hex')
    .substring(0, 32);
}

export async function processImage(
  imagePath: string,
  sourceDir: string,
  outputDir: string,
  thumbnailDir: string,
): Promise<void> {
  const filename = path.basename(imagePath);

  try {
    const imageMetadata = await sharp(imagePath).metadata();
    const { width = 0, height = 0, size = 0, format } = imageMetadata;

    // Extract EXIF data (keywords come from folder path, not EXIF)
    const exifData = await extractExifData(imagePath);

    // Generate UUID early — used for hash-based output filenames
    const uuid = generateUUID(filename, exifData.dateCaptured);
    const ext = path.extname(filename);
    const hashFilename = `${uuid}${ext}`;
    const thumbnailFilename = `thumb_${uuid}.jpg`;

    // Check for duplicate on disk
    const outputImagePath = path.join(outputDir, hashFilename);
    try {
      await fs.access(outputImagePath);
      console.warn(`Duplicate found: ${filename} → ${uuid} (already exists)`);
    } catch {
      // File doesn't exist — expected path, continue
    }

    // Generate thumbnail from source before moving
    const thumbnailPath = path.join(thumbnailDir, thumbnailFilename);
    await createThumbnail(imagePath, thumbnailPath);

    // Generate blurhash from source
    const blurhash = await generateBlurhash(imagePath);

    // Move original to public/images/ with hash-based name
    await fs.copyFile(imagePath, outputImagePath);
    await fs.unlink(imagePath);

    // Derive tags from folder structure
    const tags = deriveTagsFromPath(imagePath, sourceDir);
    const keywords = tags.length > 0 ? JSON.stringify(tags) : null;

    // Calculate aspect ratio
    const aspectRatio =
      width && height ? approximateAspectRatio(width, height) : 1;

    // Upsert photo record
    const existing = await db
      .select()
      .from(photos)
      .where(sql`${photos.uuid} = ${uuid}`)
      .limit(1);

    const record = {
      filename,
      originalPath: hashFilename,
      thumbnailPath: `thumbnails/${thumbnailFilename}`,
      blurhash,
      width,
      height,
      aspectRatio,
      fileSize: size,
      mimeType: format ? `image/${format}` : 'image/jpeg',
      ...exifData,
      keywords,
    };

    if (existing.length > 0) {
      await db
        .update(photos)
        .set({ ...record, updatedAt: new Date() })
        .where(sql`${photos.uuid} = ${uuid}`);
    } else {
      await db.insert(photos).values({ uuid, ...record });
    }
  } catch (error) {
    console.error(`Error processing ${filename}:`, error);
  }
}
