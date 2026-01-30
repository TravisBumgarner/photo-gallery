import fs from 'fs/promises';
import path from 'path';


const VALID_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp'];

export async function scanDirectory(dir: string): Promise<string[]> {
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
        if (VALID_IMAGE_EXTENSIONS.includes(ext) && nameWithoutExt.endsWith('_exported_for_viewing_locally')) {
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
