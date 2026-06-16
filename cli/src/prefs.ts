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
}

const DEFAULTS: Prefs = {
  phases: ['process', 'sync'],
  adapter: 'manual',
  mode: 'update',
  tasks: ['ingest', 'tag', 'faces', 'dogs'],
};

export function loadPrefs(): Prefs {
  try {
    if (existsSync(PREFS)) {
      return { ...DEFAULTS, ...JSON.parse(readFileSync(PREFS, 'utf8')) };
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
