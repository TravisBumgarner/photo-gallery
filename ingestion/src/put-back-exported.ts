import fs from 'node:fs/promises';
import path from 'node:path';
import {
  MANIFEST_FILE,
  type Manifest,
  getDestDir,
  moveFile,
  pathExists,
} from './exported-helpers.js';

async function main() {
  const destDir = getDestDir();
  const manifestPath = path.join(destDir, MANIFEST_FILE);

  if (!(await pathExists(manifestPath))) {
    console.error(`No manifest found at ${manifestPath}`);
    process.exit(1);
  }

  const raw = await fs.readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(raw) as Manifest;

  console.log(`Restoring ${manifest.entries.length} files`);

  let restored = 0;
  let skipped = 0;
  for (const { from, to } of manifest.entries) {
    if (!(await pathExists(to))) {
      console.warn(`Skip (missing in dest): ${to}`);
      skipped += 1;
      continue;
    }
    if (await pathExists(from)) {
      console.warn(`Skip (already exists at original): ${from}`);
      skipped += 1;
      continue;
    }
    await fs.mkdir(path.dirname(from), { recursive: true });
    await moveFile(to, from);
    console.log(`Restored ${from}`);
    restored += 1;
  }

  if (restored === manifest.entries.length) {
    await fs.unlink(manifestPath);
    try {
      await fs.rmdir(destDir);
      console.log(`Removed empty folder ${destDir}`);
    } catch {
      // folder isn't empty (other files present) — leave it
    }
  }

  console.log(`\nRestored ${restored}, skipped ${skipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
