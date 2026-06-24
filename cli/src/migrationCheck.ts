import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OP_DIR = path.join(ROOT, 'offline-processing');

// Mirror of offline-processing/src/migration-status.ts. The CLI has no sqlite
// driver, so it shells out to that workspace and parses the JSON it prints.
export type MigrationState = 'fresh' | 'in-sync' | 'behind' | 'ahead';
export interface MigrationStatus {
  state: MigrationState;
  applied: number;
  available: number;
  pending: string[];
  newestApplied: string | null;
  newestAvailable: string | null;
}

/** Inspect the working DB's schema version vs the migrations this code ships. */
export async function checkMigrations(): Promise<MigrationStatus> {
  const { stdout } = await execFileP(
    'npm',
    ['--silent', 'run', 'check-migrations'],
    { cwd: OP_DIR },
  );
  // Be defensive about any stray output: take the last JSON-looking line.
  const line = stdout
    .trim()
    .split('\n')
    .reverse()
    .find((l) => l.trim().startsWith('{'));
  if (!line) throw new Error('Could not read migration status.');
  return JSON.parse(line) as MigrationStatus;
}

/** Apply pending migrations (snapshots the DB first; aborts if DB is ahead). */
export async function applyMigrations(): Promise<void> {
  await execFileP('npm', ['--silent', 'run', 'migrate'], { cwd: OP_DIR });
}
