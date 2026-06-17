import path from 'node:path';
import { publishToStorage } from 'shared/publish';
import { createStorage } from 'shared/storage';
import { loadConfig, storageUrl } from './config.js';
import { summary } from './progress.js';
import { expandHome } from './util.js';

// Publish a read-only release from the fat ingestion DB: per-photo sidecars,
// labels.json, and a slim embedding-free DB snapshot + `latest` pointer. Media
// (images/thumbnails) is published separately. Run after ingest/tag/cluster.
async function main() {
  const config = loadConfig();

  if (!config.DATABASE_URL) {
    console.error('Refusing to run: DATABASE_URL is not set in .cli-cache.');
    process.exit(1);
  }

  const dbPath = path.resolve(expandHome(config.DATABASE_URL));
  const url = storageUrl(config);
  const version = new Date().toISOString().replace(/[:.]/g, '-');

  console.log(`Publishing snapshot ${version}`);
  console.log(`  from DB : ${dbPath}`);
  console.log(`  to      : ${url}`);

  const storage = await createStorage(url);
  const result = await publishToStorage({ dbPath, storage, version });

  console.log(
    `Done: ${result.sidecars} sidecars` +
      (result.skippedNoHash ? ` (${result.skippedNoHash} skipped — no content hash)` : '') +
      `, ${result.peopleLabels} people + ${result.dogLabels} dog labels, ` +
      `slim DB published as ${result.version}.`,
  );
  summary(
    `${result.sidecars.toLocaleString()} sidecars · ${result.peopleLabels} people + ${result.dogLabels} dog labels published`,
  );
}

main().catch((err) => {
  console.error('Publish failed:', err);
  process.exit(1);
});
