import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import path from 'node:path';
import { expandHome, STAGING_DIR, VIEWING_RE } from './configFiles.js';

// Move Lightroom preset exports OUT of an import-from folder (argv[2]) and INTO
// the staging inbox (STAGING_DIR), preserving nested structure. The wizard
// collects the import folder, so this runs non-interactively. Lightroom = export
// with the "To Mobile Photo Gallery" preset, then point the import folder here.
// Only files carrying the preset's `_exported_for_viewing_locally.*` suffix are
// moved, so unrelated originals/sidecars sharing the folder are left alone.
const ARCHIVE_DIR_NAME = '_already_processed';

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
    } else if (e.isFile() && VIEWING_RE.test(e.name)) {
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

  const dest = STAGING_DIR;
  mkdirSync(dest, { recursive: true });

  if (path.resolve(src) === path.resolve(dest)) {
    die('Import folder and staging folder are the same — nothing to move.');
  }

  const files = findImages(src);
  console.log(`Found ${files.length} preset export(s) under ${src}`);
  if (files.length === 0) {
    console.log(
      'Nothing to import — no files with the "_exported_for_viewing_locally" ' +
        'suffix here. Re-export with the "To Mobile Photo Gallery" preset, or ' +
        'point at the folder you exported to.',
    );
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
