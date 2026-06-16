import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Only runs on the faces/dogs path: starts Docker (the one Docker dependency),
// then brings up the Python detection sidecar.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OI_DIR = path.join(ROOT, 'offline-ingestion');
const INSTALL_URL = 'https://www.docker.com/products/docker-desktop/';

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
    cwd: OI_DIR,
    stdio: 'inherit',
  });
  if (r.status !== 0) {
    console.error('Failed to start the vision-server. See: docker compose logs vision-server');
    process.exit(r.status ?? 1);
  }

  // Confirm it's actually serving (models load on startup) so a broken start is
  // caught now, up front — not hours later at detect-faces.
  console.log('Waiting for detection service to be ready…');
  for (let i = 0; i < 90; i++) {
    try {
      const res = await fetch('http://localhost:8090/health', {
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
