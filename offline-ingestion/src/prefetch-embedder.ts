import { WasmEmbedder } from 'shared/embed';
import { loadConfig, modelCacheDir } from '@/config.js';

// Warm-up step: download + initialize the WASM text-embedding model up front so
// its one-time (~33 MB) HuggingFace download happens visibly here, with progress,
// instead of silently stalling the first `tag` run. Cached afterward, so this is
// a fast no-op on later runs.
async function main() {
  const config = loadConfig();
  const cacheDir = modelCacheDir(config);

  console.log('--- Prefetch text-embedding model ---');
  console.log(`  Cache dir: ${cacheDir}`);

  const t0 = Date.now();
  await WasmEmbedder.create(cacheDir);
  console.log(`  Embedder ready in ${((Date.now() - t0) / 1000).toFixed(1)}s.`);

  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
