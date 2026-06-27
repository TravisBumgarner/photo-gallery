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

/** The archive subfolder of the staging library — ingested originals are moved
 * here so they aren't re-scanned. Skipped by default; included on "start over". */
export const ARCHIVE_DIR_NAME = '_already_processed';

// Recursively collect every valid image file under `dir`. The ingest is
// preprocessing-agnostic — it processes whatever is in the folder. The
// _already_processed archive is skipped unless `includeArchive` (start over).
export async function scanDirectory(
  dir: string,
  includeArchive = false,
): Promise<string[]> {
  const files: string[] = [];

  async function scan(currentDir: string) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (!includeArchive && entry.name === ARCHIVE_DIR_NAME) continue;
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
