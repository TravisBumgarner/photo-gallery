import path from 'node:path';
import { restoreFromSidecars } from 'shared/rebuild';
import { createStorage } from 'shared/storage';
import { loadConfig, storageUrl } from './config.js';
import { summary } from './progress.js';
import { expandHome } from './util.js';

// Repopulate freshly-ingested photos from sidecars in storage, skipping the
// expensive model re-runs. Safe to run every time: it only fills gaps, so a
// first run with no sidecars is a no-op. Run after `ingest`, before tag/detect.
async function main() {
  const config = loadConfig();
  if (!config.DATABASE_URL) {
    console.error('Refusing to run: DATABASE_URL is not set in .cli-cache.');
    process.exit(1);
  }
  const dbPath = path.resolve(expandHome(config.DATABASE_URL));
  const storage = await createStorage(storageUrl(config));

  const r = await restoreFromSidecars(dbPath, storage);
  console.log(
    `Restored from sidecars: ${r.photosTagged} tagged, ` +
      `${r.facesRestored} faces, ${r.dogsRestored} dogs ` +
      `(${r.sidecarsMissing} photos had no sidecar — will be computed fresh).`,
  );
  summary(
    r.photosTagged || r.facesRestored || r.dogsRestored
      ? `${r.photosTagged.toLocaleString()} tagged · ${r.facesRestored} faces · ${r.dogsRestored} dogs restored${r.sidecarsMissing ? ` · ${r.sidecarsMissing} to compute fresh` : ''}`
      : 'no sidecars — everything computed fresh',
  );
}

main().catch((err) => {
  console.error('Restore failed:', err);
  process.exit(1);
});
