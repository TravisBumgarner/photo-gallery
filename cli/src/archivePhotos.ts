import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expandHome } from './configFiles.js';

// After ingest, move the originals out of the staging library into its
// _already_processed/ archive (so staging stays an inbox and they're not
// re-scanned). Downstream tag/faces/dogs read the resized copies in data/out,
// not staging, so this is safe to run right after ingest.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CLI_CACHE = path.join(ROOT, 'offline-processing', '.cli-cache');
const IMAGE_RE = /\.(jpe?g|png|gif|bmp|tiff?|webp)$/i;
const ARCHIVE_DIR_NAME = '_already_processed';

function readCliCache(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const line of readFileSync(CLI_CACHE, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2];
    }
  } catch {
    // no config yet
  }
  return out;
}

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
  const staging = expandHome((readCliCache().SOURCE_DIR ?? '').trim()).replace(
    /\/+$/,
    '',
  );
  if (!staging || !existsSync(staging)) {
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
