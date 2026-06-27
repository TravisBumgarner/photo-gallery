import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { extractExifData } from '@/exif.js';
import {
  approximateAspectRatio,
  createThumbnail,
  generateBlurhash,
  transferFullImage,
} from '@/image.js';
import { deriveTagsFromPath } from '@/scan.js';

export interface PhotoRecord {
  uuid: string;
  contentHash: string;
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
  dateCaptured: Date | null;
  iso: number | null;
  shutterSpeed: string | null;
  aperture: number | null;
  focalLength: number | null;
  rating: number | null;
  label: string | null;
  keywords: string | null;
}

function generateUUID(relativePath: string, dateCaptured: Date | null): string {
  const dateStr = dateCaptured ? dateCaptured.toISOString() : 'no-date';
  const uniqueString = `${relativePath}-${dateStr}`;
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
  fileTransferMode: 'copy' | 'cut',
): Promise<PhotoRecord> {
  const filename = path.basename(imagePath);

  // Content hash of the source bytes — the stable anchor for reattaching labels
  // across re-clustering (see shared/labels.ts).
  const contentHash = createHash('sha256')
    .update(await fs.readFile(imagePath))
    .digest('hex');

  const imageMetadata = await sharp(imagePath).metadata();
  const { width = 0, height = 0, size = 0, format } = imageMetadata;

  // Extract EXIF data (keywords come from folder path, not EXIF)
  const exifData = await extractExifData(imagePath);

  // Generate UUID early — used for hash-based output filenames
  const relativePath = path.relative(sourceDir, imagePath);
  const uuid = generateUUID(relativePath, exifData.dateCaptured);
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

  // Transfer original to output with hash-based name (optionally downscaled
  // per images.full.maxDimension). Returns new metadata only when re-encoded.
  const transferred = await transferFullImage(imagePath, outputImagePath);
  if (fileTransferMode === 'cut') {
    await fs.unlink(imagePath);
  }
  const outWidth = transferred?.width ?? width;
  const outHeight = transferred?.height ?? height;
  const outSize = transferred?.size ?? size;

  // Derive tags from folder structure
  const tags = deriveTagsFromPath(imagePath, sourceDir);
  const keywords = tags.length > 0 ? JSON.stringify(tags) : null;

  // Calculate aspect ratio
  const aspectRatio =
    outWidth && outHeight ? approximateAspectRatio(outWidth, outHeight) : 1;

  return {
    uuid,
    contentHash,
    filename,
    originalPath: hashFilename,
    thumbnailPath: `thumbnails/${thumbnailFilename}`,
    blurhash,
    width: outWidth,
    height: outHeight,
    aspectRatio,
    fileSize: outSize,
    mimeType: format ? `image/${format}` : 'image/jpeg',
    ...exifData,
    keywords,
  };
}
