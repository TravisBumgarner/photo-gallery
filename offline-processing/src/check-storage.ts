import { createStorage } from 'shared/storage';
import { loadConfig, storageUrl } from './config.js';
import { summary } from './progress.js';

// Up-front readiness check for the online gallery destination: prove we can
// actually write to it (a put/get/delete round-trip) BEFORE the hours-long
// tag/detect work, so a wrong bucket or bad credentials fails fast instead of
// at publish/sync hours later. Runs whenever the run will write to storage.
async function main() {
  const config = loadConfig();
  const url = storageUrl(config);

  console.log('--- Check online gallery ---');
  console.log(`  Destination: ${url}`);

  const storage = await createStorage(url);
  const key = '.ingest-write-check';
  const probe = Buffer.from(`write-check ${new Date().toISOString()}`);
  try {
    await storage.put(key, probe);
    const back = await storage.get(key);
    if (!back.equals(probe)) throw new Error('read-back did not match what was written');
    await storage.delete(key);
  } catch (err) {
    console.error(`\nCan’t write to the online gallery (${url}).`);
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    console.error(
      '  Check the storage URL / credentials: ./ingest-and-sync --setup',
    );
    process.exit(1);
  }

  console.log('  Reachable and writable.');
  summary('online gallery reachable');
}

main().catch((err) => {
  console.error('Storage check failed:', err);
  process.exit(1);
});
