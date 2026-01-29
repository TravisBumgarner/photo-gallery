import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { encode } from 'blurhash';
import { ExifTool } from 'exiftool-vendored';
import { createHash } from 'crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { photos } from '../db/schema.js';

const exiftool = new ExifTool({ maxProcs: 10 }); // Increase concurrent exiftool processes

const THUMBNAIL_WIDTH = 400;
const BLURHASH_COMPONENTS_X = 4;
const BLURHASH_COMPONENTS_Y = 3;
const PARALLEL_BATCH_SIZE = 20; // Process 20 images at a time

// Common aspect ratios with tolerance
const COMMON_ASPECT_RATIOS = [
  { ratio: 1.0, label: '1:1' },      // Square
  { ratio: 1.33, label: '4:3' },    // Standard
  { ratio: 1.5, label: '3:2' },     // Classic 35mm
  { ratio: 1.78, label: '16:9' },   // Widescreen
  { ratio: 2.35, label: '21:9' },   // Ultra-wide
  { ratio: 0.8, label: '4:5' },     // Portrait Instagram
  { ratio: 0.67, label: '2:3' },    // Portrait classic
  { ratio: 0.56, label: '9:16' },   // Portrait widescreen
];

function approximateAspectRatio(width: number, height: number): number {
  const rawRatio = width / height;
  const tolerance = 0.05; // 5% tolerance
  
  // Find the closest common aspect ratio
  for (const { ratio } of COMMON_ASPECT_RATIOS) {
    if (Math.abs(rawRatio - ratio) <= tolerance) {
      return ratio;
    }
  }
  
  // If no match found, round to 2 decimal places
  return Math.round(rawRatio * 100) / 100;
}

function generateUUID(filename: string, dateCaptured: Date | null): string {
  // Create a unique identifier from filename and date
  const dateStr = dateCaptured ? dateCaptured.toISOString() : 'no-date';
  const uniqueString = `${filename}-${dateStr}`;
  return createHash('sha256').update(uniqueString).digest('hex').substring(0, 32);
}

interface ProcessImageOptions {
  inputDir: string;
  outputDir: string;
  thumbnailDir: string;
}

async function generateBlurhash(imagePath: string): Promise<string> {
  const image = sharp(imagePath);
  const { data, info } = await image
    .raw()
    .ensureAlpha()
    .resize(32, 32, { fit: 'inside' })
    .toBuffer({ resolveWithObject: true });

  return encode(
    new Uint8ClampedArray(data),
    info.width,
    info.height,
    BLURHASH_COMPONENTS_X,
    BLURHASH_COMPONENTS_Y
  );
}

async function createThumbnail(
  imagePath: string,
  outputPath: string
): Promise<{ width: number; height: number }> {
  const info = await sharp(imagePath)
    .resize(THUMBNAIL_WIDTH, null, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toFile(outputPath);

  return { width: info.width, height: info.height };
}

async function extractExifData(imagePath: string) {
  try {
    const metadata = await exiftool.read(imagePath);
    
    // Extract camera info
    const camera = [metadata.Make, metadata.Model].filter(Boolean).join(' ').trim() || null;
    const lens = metadata.LensModel || metadata.LensID || null;
    
    // Extract date
    const dateCaptured = metadata.DateTimeOriginal || metadata.CreateDate || null;
    
    // Extract exposure settings
    const iso = metadata.ISO || null;
    const shutterSpeed = metadata.ShutterSpeed || metadata.ExposureTime || null;
    const aperture = metadata.FNumber || metadata.Aperture || null;
    const focalLength = metadata.FocalLength ? parseFloat(String(metadata.FocalLength)) : null;
    
    // Extract keywords
    let keywords: string[] = [];
    if (metadata.Keywords) {
      keywords = Array.isArray(metadata.Keywords) ? metadata.Keywords : [metadata.Keywords];
    } else if (metadata.Subject) {
      keywords = Array.isArray(metadata.Subject) ? metadata.Subject : [metadata.Subject];
    }
    
    // Extract Lightroom metadata
    const rating = metadata.Rating ? parseInt(String(metadata.Rating)) : null;
    const label = metadata.Label ? String(metadata.Label) : null;
    
    return {
      camera,
      lens,
      dateCaptured: dateCaptured ? new Date(String(dateCaptured)) : null,
      iso,
      shutterSpeed: shutterSpeed ? String(shutterSpeed) : null,
      aperture: aperture ? parseFloat(String(aperture)) : null,
      focalLength,
      keywords: keywords.length > 0 ? JSON.stringify(keywords) : null,
      rating,
      label,
    };
  } catch (error) {
    console.error(`Error extracting EXIF from ${imagePath}:`, error);
    return {
      camera: null,
      lens: null,
      dateCaptured: null,
      iso: null,
      shutterSpeed: null,
      aperture: null,
      focalLength: null,
      keywords: null,
      rating: null,
      label: null,
    };
  }
}

async function processImage(
  imagePath: string,
  options: ProcessImageOptions
): Promise<void> {
  const filename = path.basename(imagePath);

  try {
    // Get image metadata
    const imageMetadata = await sharp(imagePath).metadata();
    const { width = 0, height = 0, size = 0, format } = imageMetadata;

    // Copy original image to output directory
    const outputImagePath = path.join(options.outputDir, filename);
    await fs.copyFile(imagePath, outputImagePath);

    // Create thumbnail
    const thumbnailFilename = `thumb_${filename.replace(path.extname(filename), '.jpg')}`;
    const thumbnailPath = path.join(options.thumbnailDir, thumbnailFilename);
    await createThumbnail(imagePath, thumbnailPath);

    // Generate blurhash
    const blurhash = await generateBlurhash(imagePath);

    // Extract EXIF data
    const exifData = await extractExifData(imagePath);

    // Calculate aspect ratio with approximation
    const aspectRatio = width && height ? approximateAspectRatio(width, height) : 1;

    // Generate UUID from filename and date
    const uuid = generateUUID(filename, exifData.dateCaptured);

    // Check if photo already exists by UUID
    const existing = await db.select().from(photos).where(sql`${photos.uuid} = ${uuid}`).limit(1);

    if (existing.length > 0) {
      // Update existing photo
      await db.update(photos)
        .set({
          filename,
          originalPath: filename,
          thumbnailPath: `thumbnails/${thumbnailFilename}`,
          blurhash,
          width,
          height,
          aspectRatio,
          fileSize: size,
          mimeType: format ? `image/${format}` : 'image/jpeg',
          updatedAt: new Date(),
          ...exifData,
        })
        .where(sql`${photos.uuid} = ${uuid}`);
    } else {
      // Insert new photo
      await db.insert(photos).values({
        uuid,
        filename,
        originalPath: filename,
        thumbnailPath: `thumbnails/${thumbnailFilename}`,
        blurhash,
        width,
        height,
        aspectRatio,
        fileSize: size,
        mimeType: format ? `image/${format}` : 'image/jpeg',
        ...exifData,
      });
    }
  } catch (error) {
    console.error(`Error processing ${filename}:`, error);
  }
}

async function scanDirectory(dir: string): Promise<string[]> {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'];
  const files: string[] = [];

  async function scan(currentDir: string) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        await scan(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (imageExtensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  await scan(dir);
  return files;
}

async function main() {
  const inputDir = process.argv[2] || './photos';
  const outputDir = path.resolve('./public/images');
  const thumbnailDir = path.resolve('./public/thumbnails');

  console.log('📸 Photo Processing Script\n');
  console.log(`Input directory: ${inputDir}`);
  console.log(`Output directory: ${outputDir}`);
  console.log(`Thumbnail directory: ${thumbnailDir}\n`);

  // Create directories
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(thumbnailDir, { recursive: true });

  // Scan for images
  console.log('Scanning for images...');
  const imagePaths = await scanDirectory(inputDir);
  console.log(`Found ${imagePaths.length} images\n`);

  if (imagePaths.length === 0) {
    console.log('No images found. Please provide a directory with images.');
    console.log('Usage: npm run process-images [path-to-photos]');
    await exiftool.end();
    return;
  }

  // Process each image
  let processed = 0;
  let skipped = 0;
  let failed = 0;
  const startTime = Date.now();

  // Process images in parallel batches
  for (let i = 0; i < imagePaths.length; i += PARALLEL_BATCH_SIZE) {
    const batch = imagePaths.slice(i, i + PARALLEL_BATCH_SIZE);
    const batchNum = Math.floor(i / PARALLEL_BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(imagePaths.length / PARALLEL_BATCH_SIZE);
    
    console.log(`\nBatch ${batchNum}/${totalBatches} (${i + 1}-${Math.min(i + batch.length, imagePaths.length)}/${imagePaths.length})`);
    
    const results = await Promise.allSettled(
      batch.map(imagePath => processImage(imagePath, {
        inputDir,
        outputDir,
        thumbnailDir,
      }))
    );
    
    // Count results
    results.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        processed++;
      } else {
        failed++;
        console.error(`  ✗ Failed: ${path.basename(batch[idx])} - ${result.reason}`);
      }
    });
    
    // Show progress
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = processed / elapsed;
    const remaining = imagePaths.length - (i + batch.length);
    const eta = remaining / rate;
    console.log(`  Progress: ${processed} processed, ${failed} failed | ${rate.toFixed(1)} img/sec | ETA: ${Math.ceil(eta)}s`);
  }

  await exiftool.end();
  
  const totalTime = (Date.now() - startTime) / 1000;
  console.log('\n✅ Processing complete!');
  console.log(`   Processed: ${processed}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Total time: ${Math.ceil(totalTime)}s (${(processed / totalTime).toFixed(1)} images/sec)`);
}

main().catch((error) => {
  console.error('Error:', error);
  exiftool.end();
  process.exit(1);
});
