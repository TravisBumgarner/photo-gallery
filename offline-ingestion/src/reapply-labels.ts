import path from 'node:path';
import { applyLabels } from 'shared/rebuild';
import { createStorage } from 'shared/storage';
import { loadConfig, storageUrl } from './config.js';
import { expandHome } from './util.js';

// Reattach durable labels (labels.json) to the current clusters after
// (re-)clustering. Labels are pinned to detection anchors, so they survive the
// cluster IDs churning. No-op when there is no labels.json yet.
async function main() {
  const config = loadConfig();
  if (!config.DATABASE_URL) {
    console.error('Refusing to run: DATABASE_URL is not set in .cli-cache.');
    process.exit(1);
  }
  const dbPath = path.resolve(expandHome(config.DATABASE_URL));
  const storage = await createStorage(storageUrl(config));

  const r = await applyLabels(dbPath, storage);
  console.log(
    `Reapplied labels: ${r.peopleApplied} people, ${r.dogsApplied} dogs.`,
  );
}

main().catch((err) => {
  console.error('Reapply labels failed:', err);
  process.exit(1);
});
