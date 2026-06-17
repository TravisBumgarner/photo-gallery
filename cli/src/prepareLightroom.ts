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

// Moves the Lightroom preset's viewing copies (*_exported_for_viewing_locally.*)
// OUT of the export folder and INTO the ingest folder (SOURCE_DIR), preserving
// the nested folder structure. Originals/RAW are left in place. Runs as a step
// under the orchestrator's Runner: the wizard has already collected + dry-tested
// the export folder and passes it as argv[2], so this is non-interactive.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CLI_CACHE = path.join(ROOT, 'offline-processing', '.cli-cache');
// The suffix Lightroom's "To Mobile Photo Gallery" preset appends to each export.
const VIEWING_RE = /_exported_for_viewing_locally\.[^.]+$/i;

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

/** Absolute paths of every viewing copy under `dir`, recursing all the way. */
function findExports(dir: string): string[] {
  const out: string[] = [];
  for (const e of listDir(dir)) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...findExports(full));
    else if (e.isFile() && VIEWING_RE.test(e.name)) out.push(full);
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
  if (!src || !existsSync(src)) die(`Folder does not exist: '${src}'`);

  const dest = expandHome((readCliCache().SOURCE_DIR ?? '').trim()).replace(
    /\/+$/,
    '',
  );
  if (!dest) die('No ingestion folder set (SOURCE_DIR missing from .cli-cache).');
  mkdirSync(dest, { recursive: true });

  if (path.resolve(src) === path.resolve(dest)) {
    die('Lightroom folder and ingestion folder are the same — nothing to move.');
  }

  const files = findExports(src);
  console.log(
    `Found ${files.length} *_exported_for_viewing_locally files under ${src}`,
  );
  if (files.length === 0) {
    console.log('Nothing to move.');
    return;
  }
  console.log(
    `Moving into ${dest} (folder structure preserved; originals left in place).`,
  );

  let moved = 0;
  for (const f of files) {
    const target = path.join(dest, path.relative(src, f));
    mkdirSync(path.dirname(target), { recursive: true });
    moveFile(f, target);
    moved++;
  }
  console.log(`Moved ${moved} files into ${dest}`);
}

main();
