import fs from 'node:fs/promises';
import path from 'node:path';

const VALID_IMAGE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.bmp',
  '.tiff',
  '.webp',
];

// Recursively collect every valid image file under `dir`. The ingest is
// preprocessing-agnostic — it processes whatever is in the folder, however it
// got there (see README "Prepare the Photo Ingestion Directory").
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
        if (VALID_IMAGE_EXTENSIONS.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  await scan(dir);
  return files;
}

export function deriveTagsFromPath(
  imagePath: string,
  sourceDir: string,
): string[] {
  const relative = path.relative(sourceDir, imagePath);
  const parts = path.dirname(relative).split(path.sep);
  return parts.filter((p) => p !== '.');
}
