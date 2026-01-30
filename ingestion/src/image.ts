import { encode } from 'blurhash';
import sharp from 'sharp';

const THUMBNAIL_WIDTH = 300;
const BLURHASH_COMPONENTS_X = 4;
const BLURHASH_COMPONENTS_Y = 3;

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
    BLURHASH_COMPONENTS_X,
    BLURHASH_COMPONENTS_Y,
  );
}

export async function createThumbnail(
  imagePath: string,
  outputPath: string,
): Promise<{ width: number; height: number }> {
  const { data, info } = await sharp(imagePath, { failOn: 'none' })
    .toColourspace('srgb')
    .resize(THUMBNAIL_WIDTH, null, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer({ resolveWithObject: true });

  const fsModule = await import('node:fs/promises');
  await fsModule.writeFile(outputPath, data);

  return { width: info.width, height: info.height };
}
