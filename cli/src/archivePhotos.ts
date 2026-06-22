import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import path from 'node:path';
import { STAGING_DIR } from './configFiles.js';

// After ingest, move the originals out of the staging inbox into its
// _already_processed/ archive (so staging stays an inbox and they're not
// re-scanned). Downstream tag/faces/dogs read the resized copies in data/out,
// not staging, so this is safe to run right after ingest.
const IMAGE_RE = /\.(jpe?g|png|gif|bmp|tiff?|webp)$/i;
const ARCHIVE_DIR_NAME = '_already_processed';

function listDir(dir: string) {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** Images in staging, excluding the archive subfolder. */
function findImages(dir: string): string[] {
  const out: string[] = [];
  for (const e of listDir(dir)) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === ARCHIVE_DIR_NAME) continue;
      out.push(...findImages(full));
    } else if (e.isFile() && IMAGE_RE.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

function moveFile(from: string, to: string): void {
  try {
    renameSync(from, to);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err;
    copyFileSync(from, to);
    unlinkSync(from);
  }
}

function main() {
  const staging = STAGING_DIR;
  if (!existsSync(staging)) {
    console.log('No staging folder — nothing to archive.');
    return;
  }
  const archive = path.join(staging, ARCHIVE_DIR_NAME);

  const files = findImages(staging);
  if (files.length === 0) {
    console.log('Staging already clear — nothing to archive.');
    return;
  }
  let moved = 0;
  for (const f of files) {
    const target = path.join(archive, path.relative(staging, f));
    mkdirSync(path.dirname(target), { recursive: true });
    moveFile(f, target);
    moved++;
  }
  console.log(`Archived ${moved} processed original(s) to ${archive}`);
}

main();
