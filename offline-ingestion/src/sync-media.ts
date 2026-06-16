import path from 'node:path';
import { createStorage } from 'shared/storage';
import { syncMediaToStorage } from 'shared/sync';
import { loadConfig, storageUrl } from './config.js';
import { expandHome } from './util.js';

// Push images + thumbnails from DESTINATION_DIRECTORY to the storage backend,
// skipping files already present. Run as part of the Sync phase, after publish
// (which handles sidecars/labels/DB). No-op-ish when storage == local dir.
async function main() {
  const config = loadConfig();
  const dest = path.resolve(expandHome(config.DESTINATION_DIRECTORY));
  const storage = await createStorage(storageUrl(config));

  let lastLogged = 0;
  const r = await syncMediaToStorage(storage, dest, (done, total) => {
    if (done === total || done - lastLogged >= 100) {
      lastLogged = done;
      console.log(`  ${done}/${total} media files`);
    }
  });
  console.log(
    `Media sync: ${r.uploaded} uploaded, ${r.skipped} already present.`,
  );
}

main().catch((err) => {
  console.error('Sync media failed:', err);
  process.exit(1);
});
