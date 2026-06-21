import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PREFS = path.join(ROOT, '.orchestrator-prefs.json');

/** Last-used wizard selections, so re-runs are enter-enter-enter. */
export interface Prefs {
  phases: string[];
  adapter: 'lightroom' | 'manual';
  mode: 'create' | 'update';
  tasks: string[];
  lightroomDir: string;
  deployTarget: string;
}

const DEFAULTS: Prefs = {
  phases: ['process', 'sync'],
  adapter: 'manual',
  mode: 'update',
  tasks: ['ingest', 'tag', 'faces', 'dogs'],
  lightroomDir: '',
  deployTarget: '',
};

export function loadPrefs(): Prefs {
  try {
    if (existsSync(PREFS)) {
      // `mode` is deliberately NOT seeded from cache: Create is a destructive,
      // one-shot wipe, so it must never become a sticky default. A blind re-run
      // (enter-enter-enter) always resumes via Update; the user has to actively
      // re-pick Create — and confirm it — each time.
      return { ...DEFAULTS, ...JSON.parse(readFileSync(PREFS, 'utf8')), mode: 'update' };
    }
  } catch {
    // corrupt/unreadable → fall back to defaults
  }
  return DEFAULTS;
}

export function savePrefs(p: Prefs): void {
  try {
    writeFileSync(PREFS, `${JSON.stringify(p, null, 2)}\n`);
  } catch {
    // best-effort; never block the run on a prefs write
  }
}
