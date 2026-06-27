import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { markVisionServer } from './cleanup.js';

// Only runs on the faces/dogs path. For a LOCAL vision-server it starts Docker
// (the one Docker dependency) + the Python sidecar; for a REMOTE one (a
// ./model-server gateway) it just confirms it's reachable — no local Docker.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OP_DIR = path.join(ROOT, 'offline-processing');
const CLI_CACHE = path.join(OP_DIR, '.cli-cache');
const INSTALL_URL = 'https://www.docker.com/products/docker-desktop/';

function visionHost(): string {
  try {
    for (const line of readFileSync(CLI_CACHE, 'utf8').split('\n')) {
      const m = line.match(/^VISION_SERVER_HOST=(.*)$/);
      if (m) return m[1].trim().replace(/\/+$/, '');
    }
  } catch {
    // no config yet
  }
  return 'http://localhost:8090';
}

const dockerInstalled = () =>
  spawnSync('docker', ['--version'], { stdio: 'ignore' }).status === 0;
const dockerUp = () =>
  spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Best-effort launch of Docker per platform (still need to poll until up). */
function tryStartDocker(): void {
  if (process.platform === 'darwin') {
    spawnSync('open', ['-a', 'Docker'], { stdio: 'ignore' });
  } else if (process.platform === 'win32') {
    spawnSync('cmd', ['/c', 'start', '', 'Docker Desktop'], { stdio: 'ignore' });
  } else {
    // Linux: Docker Desktop, then the engine service (may need privileges).
    if (
      spawnSync('systemctl', ['--user', 'start', 'docker-desktop'], {
        stdio: 'ignore',
      }).status !== 0
    ) {
      spawnSync('systemctl', ['start', 'docker'], { stdio: 'ignore' });
    }
  }
}

async function main() {
  const host = visionHost();
  const local = /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(host);

  // Remote vision-server (via a ./model-server gateway): nothing to start here —
  // just confirm it's up. /health is open on the gateway, so no token needed.
  if (!local) {
    console.log(`Detection service is remote (${host}) — checking it's reachable…`);
    try {
      const res = await fetch(`${host}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        console.log('Detection service reachable.');
        process.exit(0);
      }
      console.error(`Detection service at ${host} returned ${res.status}.`);
    } catch {
      console.error(`Detection service unreachable at ${host}.`);
      console.error('Make sure ./model-server is running on that machine.');
    }
    process.exit(1);
  }

  if (!dockerUp()) {
    if (!dockerInstalled()) {
      console.error('Faces/dogs detection needs Docker, and it isn’t installed.');
      console.error(`  Install Docker Desktop: ${INSTALL_URL}`);
      console.error('  Then re-run — or re-run with faces/dogs unchecked.');
      process.exit(1);
    }
    console.log('Faces/dogs detection needs Docker — starting Docker Desktop…');
    tryStartDocker();
    let waited = 0;
    while (!dockerUp()) {
      await sleep(2000);
      waited += 2;
      console.log(
        `  Waiting for Docker to start (${waited}s)… if it doesn’t come up, open Docker Desktop manually (${INSTALL_URL} to install). Ctrl-C to cancel.`,
      );
    }
  }
  console.log('Docker ready — building/starting detection service…');
  const r = spawnSync('docker', ['compose', 'up', '-d', 'vision-server'], {
    cwd: OP_DIR,
    stdio: 'inherit',
  });
  if (r.status !== 0) {
    console.error('Failed to start the vision-server. See: docker compose logs vision-server');
    process.exit(r.status ?? 1);
  }
  // We started it — let shutdown stop it (even if the health poll below fails).
  markVisionServer();

  // Confirm it's actually serving (models load on startup) so a broken start is
  // caught now, up front — not hours later at detect-faces.
  console.log('Waiting for detection service to be ready…');
  for (let i = 0; i < 90; i++) {
    try {
      const res = await fetch(`${host}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        console.log('Detection service ready.');
        process.exit(0);
      }
    } catch {
      // not up yet
    }
    await sleep(2000);
  }
  console.error(
    'Detection service did not become healthy. Check: docker compose logs vision-server',
  );
  process.exit(1);
}

main();
