import fs from 'node:fs/promises';
import path from 'node:path';
import { encode } from 'blurhash';
import sharp from 'sharp';
import { settings } from '@/settings.js';

const COMMON_ASPECT_RATIOS = [
  { ratio: 1.0, label: '1:1' },
  { ratio: 1.33, label: '4:3' },
  { ratio: 1.5, label: '3:2' },
  { ratio: 1.78, label: '16:9' },
  { ratio: 2.35, label: '21:9' },
  { ratio: 0.8, label: '4:5' },
  { ratio: 0.67, label: '2:3' },
  { ratio: 0.56, label: '9:16' },
];

export function approximateAspectRatio(width: number, height: number): number {
  const rawRatio = width / height;
  const tolerance = 0.05;

  for (const { ratio } of COMMON_ASPECT_RATIOS) {
    if (Math.abs(rawRatio - ratio) <= tolerance) {
      return ratio;
    }
  }

  return Math.round(rawRatio * 100) / 100;
}

export async function generateBlurhash(imagePath: string): Promise<string> {
  const image = sharp(imagePath, { failOn: 'none' });
  const { data, info } = await image
    .toColourspace('srgb')
    .raw()
    .ensureAlpha()
    .resize(32, 32, { fit: 'inside' })
    .toBuffer({ resolveWithObject: true });

  return encode(
    new Uint8ClampedArray(data),
    info.width,
    info.height,
    settings.images.blurhash.componentsX,
    settings.images.blurhash.componentsY,
  );
}

export async function createThumbnail(
  imagePath: string,
  outputPath: string,
): Promise<{ width: number; height: number }> {
  const { data, info } = await sharp(imagePath, { failOn: 'none' })
    .toColourspace('srgb')
    .resize(settings.images.thumbnail.width, null, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: settings.images.thumbnail.quality })
    .toBuffer({ resolveWithObject: true });

  await fs.writeFile(outputPath, data);

  return { width: info.width, height: info.height };
}

// Transfer the original into the gallery. By default (images.full.maxDimension =
// null) the file is copied verbatim and we return null so the caller keeps the
// source's own width/height/size. If maxDimension is set we downscale + re-encode
// raster formats and return the new metadata. Unsupported formats fall back to a
// verbatim copy.
export async function transferFullImage(
  imagePath: string,
  outputPath: string,
): Promise<{ width: number; height: number; size: number } | null> {
  const { maxDimension, quality } = settings.images.full;
  const ext = path.extname(outputPath).toLowerCase();
  const encodable =
    ext === '.jpg' || ext === '.jpeg' || ext === '.png' || ext === '.webp';

  if (maxDimension && encodable) {
    let pipeline = sharp(imagePath, { failOn: 'none' }).resize(
      maxDimension,
      maxDimension,
      { fit: 'inside', withoutEnlargement: true },
    );
    if (ext === '.png') pipeline = pipeline.png();
    else if (ext === '.webp') pipeline = pipeline.webp({ quality });
    else pipeline = pipeline.jpeg({ quality });
    const info = await pipeline.toFile(outputPath);
    return { width: info.width, height: info.height, size: info.size };
  }

  await fs.copyFile(imagePath, outputPath);
  return null;
}
