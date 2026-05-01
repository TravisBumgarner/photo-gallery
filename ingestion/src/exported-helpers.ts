import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const DEST_FOLDER_NAME = 'exported_for_viewing_locally';
export const MANIFEST_FILE = 'moved_files.json';

export type ManifestEntry = { from: string; to: string };
export type Manifest = { createdAt: string; entries: ManifestEntry[] };

export function expandHome(p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

export function getDestDir(): string {
  return path.join(os.homedir(), 'Desktop', DEST_FOLDER_NAME);
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function moveFile(src: string, dest: string): Promise<void> {
  try {
    await fs.rename(src, dest);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
      await fs.copyFile(src, dest);
      await fs.unlink(src);
      return;
    }
    throw err;
  }
}
