import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { ExifTool } from 'exiftool-vendored';

const exiftool = new ExifTool();
const MAX_PHOTOS = 10; // Change this to process more/fewer photos

async function scanDirectory(dir: string, maxFiles: number): Promise<string[]> {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'];
  const files: string[] = [];

  async function scan(currentDir: string) {
    if (files.length >= maxFiles) return;
    
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (files.length >= maxFiles) break;
      
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

async function inspectPhoto(imagePath: string, index: number, total: number) {
  const filename = path.basename(imagePath);
  console.log(`\n[$${index + 1}/${total}] ${filename}`);
  console.log('='.repeat(80));

  try {
    // Sharp metadata
    const metadata = await sharp(imagePath).metadata();
    console.log(`Format: ${metadata.format}`);
    console.log(`Size: ${metadata.width}x${metadata.height}`);
    console.log(`File size: ${(metadata.size || 0) / 1024 / 1024} MB`);
    console.log(`Color space: ${metadata.space}`);
    console.log(`Channels: ${metadata.channels}`);

    // ExifTool metadata
    const exif = await exiftool.read(imagePath);
    
    console.log(`\nCamera: ${[exif.Make, exif.Model].filter(Boolean).join(' ') || 'N/A'}`);
    console.log(`Lens: ${exif.LensModel || exif.LensID || 'N/A'}`);
    console.log(`Date: ${exif.DateTimeOriginal || exif.CreateDate || 'N/A'}`);
    console.log(`ISO: ${exif.ISO || 'N/A'}`);
    console.log(`Aperture: ${exif.FNumber || exif.Aperture || 'N/A'}`);
    console.log(`Shutter: ${exif.ShutterSpeed || exif.ExposureTime || 'N/A'}`);
    console.log(`Focal Length: ${exif.FocalLength || 'N/A'}`);
    
    // Keywords
    let keywords: string[] = [];
    if (exif.Keywords) {
      keywords = Array.isArray(exif.Keywords) ? exif.Keywords : [exif.Keywords];
    } else if (exif.Subject) {
      keywords = Array.isArray(exif.Subject) ? exif.Subject : [exif.Subject];
    }
    console.log(`Keywords: ${keywords.length > 0 ? keywords.join(', ') : 'N/A'}`);
    
    // Lightroom metadata
    console.log(`\nLightroom:`);
    console.log(`  Rating: ${exif.Rating || 'N/A'}`);
    console.log(`  Label: ${exif.Label || 'N/A'}`);
    
    // GPS
    if (exif.GPSLatitude && exif.GPSLongitude) {
      console.log(`\nGPS: ${exif.GPSLatitude}, ${exif.GPSLongitude}`);
    }
    
    // Additional interesting fields
    console.log(`\nOther fields available:`);
    const interestingFields = [
      'Copyright', 'Artist', 'ImageDescription', 'Software', 
      'WhiteBalance', 'Flash', 'ExposureMode', 'MeteringMode',
      'ColorSpace', 'Orientation',
      // Lightroom-specific fields
      'XMP:Rating', 'XMP:Label', 'XMP:Marked', 'XMP:Select',
      'MicrosoftPhoto:Rating', 'IPTC:Urgency'
    ];
    interestingFields.forEach(field => {
      if ((exif as Record<string, unknown>)[field]) {
        console.log(`  ${field}: ${(exif as Record<string, unknown>)[field]}`);
      }
    });
    
  } catch (error) {
    console.error(`❌ Error processing: ${error}`);
  }
}

async function main() {
  const inputDir = process.argv[2];

  if (!inputDir) {
    console.error('Usage: npm run inspect-photo <directory-path>');
    process.exit(1);
  }

  console.log(`📸 Photo Inspector (Max: ${MAX_PHOTOS} photos)\n`);
  console.log(`Scanning: ${inputDir}\n`);

  const photos = await scanDirectory(inputDir, MAX_PHOTOS);
  
  if (photos.length === 0) {
    console.log('No photos found.');
    await exiftool.end();
    return;
  }

  console.log(`Found ${photos.length} photo(s)\n`);

  for (let i = 0; i < photos.length; i++) {
    await inspectPhoto(photos[i], i, photos.length);
  }

  await exiftool.end();
  console.log('\n✅ Done!');
}

main().catch((error) => {
  console.error('Error:', error);
  exiftool.end();
  process.exit(1);
});
