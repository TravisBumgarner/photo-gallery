import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from './config.js';
import {
  MANIFEST_FILE,
  type Manifest,
  type ManifestEntry,
  expandHome,
  getDestDir,
  moveFile,
  pathExists,
} from './exported-helpers.js';
import { scanDirectory } from './scan.js';

async function rotateExisting(dir: string): Promise<void> {
  if (!(await pathExists(dir))) return;
  let counter = 1;
  let target = `${dir}_old`;
  while (await pathExists(target)) {
    counter += 1;
    target = `${dir}_old${counter}`;
  }
  await fs.rename(dir, target);
  console.log(`Existing folder renamed to ${target}`);
}

async function resolveCollision(destDir: string, name: string): Promise<string> {
  const ext = path.extname(name);
  const stem = path.basename(name, ext);
  let candidate = path.join(destDir, name);
  let counter = 1;
  while (await pathExists(candidate)) {
    candidate = path.join(destDir, `${stem}_${counter}${ext}`);
    counter += 1;
  }
  return candidate;
}

async function main() {
  const env = (process.argv[2] === 'production' ? 'production' : 'local') as
    | 'local'
    | 'production';
  const config = loadConfig(env);

  const destDir = getDestDir();
  await rotateExisting(destDir);
  await fs.mkdir(destDir, { recursive: true });

  const sourceDir = expandHome(config.SOURCE_DIR);
  console.log(`Scanning ${sourceDir}`);
  const files = await scanDirectory(sourceDir);
  console.log(`Found ${files.length} matching files`);

  const entries: ManifestEntry[] = [];
  for (const src of files) {
    const dest = await resolveCollision(destDir, path.basename(src));
    await moveFile(src, dest);
    entries.push({ from: src, to: dest });
    console.log(`Moved ${src}`);
  }

  const manifest: Manifest = {
    createdAt: new Date().toISOString(),
    entries,
  };
  const manifestPath = path.join(destDir, MANIFEST_FILE);
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`\nMoved ${files.length} files to ${destDir}`);
  console.log(`Manifest: ${manifestPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
