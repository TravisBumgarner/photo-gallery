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

// Move every image OUT of an import-from folder (argv[2]) and INTO the staging
// library (SOURCE_DIR), preserving nested structure. The wizard collects the
// import folder, so this runs non-interactively. Lightroom = export with the
// preset, then point the import folder here.
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

function findImages(dir: string): string[] {
  const out: string[] = [];
  for (const e of listDir(dir)) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === ARCHIVE_DIR_NAME) continue; // never pull from the archive
      out.push(...findImages(full));
    } else if (e.isFile() && IMAGE_RE.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Like `mv`: rename, falling back to copy+unlink across filesystems (EXDEV). */
function moveFile(from: string, to: string): void {
  try {
    renameSync(from, to);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err;
    copyFileSync(from, to);
    unlinkSync(from);
  }
}

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

function main() {
  const src = expandHome((process.argv[2] ?? '').trim()).replace(/\/+$/, '');
  if (!src || !existsSync(src)) die(`Import folder doesn't exist: '${src}'`);

  const dest = expandHome((readCliCache().SOURCE_DIR ?? '').trim()).replace(
    /\/+$/,
    '',
  );
  if (!dest) die('No staging folder set (SOURCE_DIR missing from .cli-cache).');
  mkdirSync(dest, { recursive: true });

  if (path.resolve(src) === path.resolve(dest)) {
    die('Import folder and staging folder are the same — nothing to move.');
  }

  const files = findImages(src);
  console.log(`Found ${files.length} image(s) under ${src}`);
  if (files.length === 0) {
    console.log('Nothing to import.');
    return;
  }
  console.log(`Moving into staging ${dest} (folder structure preserved)…`);

  let moved = 0;
  for (const f of files) {
    const target = path.join(dest, path.relative(src, f));
    mkdirSync(path.dirname(target), { recursive: true });
    moveFile(f, target);
    moved++;
  }
  console.log(`Moved ${moved} image(s) into staging.`);
}

main();
