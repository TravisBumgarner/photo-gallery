import { ExifTool } from 'exiftool-vendored';

const exiftool = new ExifTool({ maxProcs: 10 });

export interface ExifData {
  camera: string | null;
  lens: string | null;
  dateCaptured: Date | null;
  iso: number | null;
  shutterSpeed: string | null;
  aperture: number | null;
  focalLength: number | null;
  rating: number | null;
  label: string | null;
}

export async function extractExifData(imagePath: string): Promise<ExifData> {
  try {
    const metadata = await exiftool.read(imagePath);

    const camera =
      [metadata.Make, metadata.Model].filter(Boolean).join(' ').trim() || null;
    const lens = metadata.LensModel || metadata.LensID || null;
    const dateCaptured =
      metadata.DateTimeOriginal || metadata.CreateDate || null;
    const iso = metadata.ISO || null;
    const shutterSpeed = metadata.ShutterSpeed || metadata.ExposureTime || null;
    const aperture = metadata.FNumber || metadata.Aperture || null;
    const focalLength = metadata.FocalLength
      ? parseFloat(String(metadata.FocalLength))
      : null;
    const rating = metadata.Rating
      ? parseInt(String(metadata.Rating), 10)
      : null;
    const label = metadata.Label ? String(metadata.Label) : null;

    return {
      camera,
      lens,
      dateCaptured: dateCaptured ? new Date(String(dateCaptured)) : null,
      iso,
      shutterSpeed: shutterSpeed ? String(shutterSpeed) : null,
      aperture: aperture ? parseFloat(String(aperture)) : null,
      focalLength,
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
      rating: null,
      label: null,
    };
  }
}

export async function endExiftool() {
  await exiftool.end();
}
