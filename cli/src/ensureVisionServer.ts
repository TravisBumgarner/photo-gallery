import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Only runs on the faces/dogs path. Waits for Docker (started by the user), then
// brings up the detection sidecar. Cross-platform — spawns docker, no shell loop.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OI_DIR = path.join(ROOT, 'offline-ingestion');

const dockerUp = () =>
  spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!dockerUp()) {
    console.log('Faces/dogs detection needs Docker.');
    let waited = 0;
    while (!dockerUp()) {
      await sleep(2000);
      waited += 2;
      console.log(
        `  Start Docker Desktop to continue — waiting (${waited}s). Ctrl-C to cancel.`,
      );
    }
  }
  console.log('Docker ready — starting detection service.');
  const r = spawnSync('docker', ['compose', 'up', '-d', 'vision-server'], {
    cwd: OI_DIR,
    stdio: 'inherit',
  });
  process.exit(r.status ?? 0);
}

main();
