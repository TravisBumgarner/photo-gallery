import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Tracks the heavy services THIS run started — the Docker vision-server and a
// native Ollama — so shutdown can stop them. The marks are written by the
// ensure/preflight steps (separate processes) and read by the entrypoint at
// shutdown, so the state lives in a file rather than memory. We only ever stop
// what we started: a user's pre-existing Ollama is never recorded, never killed.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OP_DIR = path.join(ROOT, 'offline-processing');
const STATE_FILE = path.join(os.tmpdir(), 'photo-gallery-cleanup.json');

interface CleanupState {
  visionServer?: boolean;
  ollamaPid?: number;
}

function read(): CleanupState {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as CleanupState;
  } catch {
    return {};
  }
}

function write(state: CleanupState): void {
  try {
    writeFileSync(STATE_FILE, JSON.stringify(state));
  } catch {
    // best-effort; never block the run on a marker write
  }
}

/** Start each run with a clean slate so shutdown only stops what this run did. */
export function resetCleanup(): void {
  try {
    rmSync(STATE_FILE, { force: true });
  } catch {
    // ignore
  }
}

/** Record that this run brought up the Docker vision-server. */
export function markVisionServer(): void {
  write({ ...read(), visionServer: true });
}

/** Record the pid of an Ollama this run started (so we only stop our own). */
export function markOllama(pid: number): void {
  write({ ...read(), ollamaPid: pid });
}

/** Stop every service this run started. Synchronous, bounded, and best-effort
 * so it's safe to call from a signal handler immediately before exit. */
export function stopServices(): void {
  const state = read();
  if (state.visionServer) {
    console.log('Stopping detection service (Docker vision-server)…');
    // -t 5: give the container 5s to stop gracefully, then it's killed.
    spawnSync('docker', ['compose', 'stop', '-t', '5', 'vision-server'], {
      cwd: OP_DIR,
      stdio: 'ignore',
      timeout: 15000,
    });
  }
  if (state.ollamaPid) {
    console.log('Stopping Ollama…');
    try {
      process.kill(-state.ollamaPid, 'SIGTERM'); // whole process group
    } catch {
      try {
        process.kill(state.ollamaPid, 'SIGTERM');
      } catch {
        // already gone
      }
    }
  }
  resetCleanup();
}
