import fs from 'fs/promises';
import path from 'path';

const DEFAULT_EXTENSIONS = '.jpg,.jpeg,.png,.webp,.heic,.heif,.avif,.tiff,.gif';

function getImageExtensions(): string[] {
  const raw = process.env.IMAGE_EXTENSIONS || DEFAULT_EXTENSIONS;
  return raw.split(',').map(ext => {
    const trimmed = ext.trim();
    return trimmed.startsWith('.') ? trimmed : `.${trimmed}`;
  });
}

export async function scanDirectory(dir: string): Promise<string[]> {
  const imageExtensions = getImageExtensions();
  const files: string[] = [];

  async function scan(currentDir: string) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        await scan(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        const nameWithoutExt = path.basename(entry.name, path.extname(entry.name));
        if (imageExtensions.includes(ext) && nameWithoutExt.endsWith('_exported_for_viewing_locally')) {
          files.push(fullPath);
        }
      }
    }
  }

  await scan(dir);
  return files;
}

export function deriveTagsFromPath(imagePath: string, sourceDir: string): string[] {
  const relative = path.relative(sourceDir, imagePath);
  const parts = path.dirname(relative).split(path.sep);
  return parts.filter(p => p !== '.');
}
