import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expandHome } from './configFiles.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Live progress while zipping/unzipping: how many files handled so far, and the
 * path of the most recent one (so a long restore shows it's moving, not hung). */
export type ProgressFn = (count: number, file: string) => void;

/** Spawn `cmd`, streaming stdout lines to `onLine`. Resolves on exit 0, rejects
 * with a tool-aware error otherwise (so ENOENT → "install it"). */
function runStreaming(
  cmd: string,
  args: string[],
  cwd: string | undefined,
  onLine: (line: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, cwd ? { cwd } : {});
    let stderr = '';
    child.stdout?.on('data', (buf: Buffer) => {
      for (const line of buf.toString().split('\n')) if (line.trim()) onLine(line);
    });
    child.stderr?.on('data', (buf: Buffer) => {
      stderr += buf.toString();
    });
    child.on('error', (err) => reject(zipToolError(err, cmd)));
    child.on('close', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(stderr.trim() || `${cmd} exited with code ${code}`)),
    );
  });
}

/** The gitignored config/secret files worth backing up. Paths are relative to
 * ROOT so the zip restores them straight back into place. */
export const CONFIG_FILES = [
  'offline-processing/.cli-cache', // pipeline config
  'backend/.env', // serving config (gallery password, session secret)
  '.deploy-params.json', // deploy SSH host/key/dir
  '.orchestrator-prefs.json', // remembered menu selections
];

/** The published gallery — the expensive, irreplaceable processed work (fat +
 * slim DB, images, thumbnails, labels). Restoring it lets the DB-restore step
 * seed the working DB so processing resumes instead of re-running from scratch. */
const DATA_DIR = 'data/out';

/** Everything a full backup captures: settings + the processed gallery. */
const BACKUP_PATHS = [...CONFIG_FILES, DATA_DIR];

/** ~/Downloads (works across macOS/Windows/Linux home layouts). */
export function downloadsDir(): string {
  return path.join(os.homedir(), 'Downloads');
}

export function defaultBackupPath(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(downloadsDir(), `photo-gallery-backup-${stamp}.zip`);
}

/** Zip a full backup (settings + the processed gallery) into `destZip`. Returns
 * the top-level entries included. Throws if there's nothing yet or `zip` is
 * missing. NOTE: includes images, so the zip can be large. */
export async function backupConfigs(
  destZip: string,
  onProgress?: ProgressFn,
): Promise<string[]> {
  const present = BACKUP_PATHS.filter((f) => existsSync(path.join(ROOT, f)));
  if (present.length === 0) {
    throw new Error('Nothing to back up yet — run setup first.');
  }
  await mkdir(path.dirname(destZip), { recursive: true });
  // -r recurses into data/out; -X drops extra attrs; archive paths are relative
  // to ROOT (cwd), so unzip restores them straight back into place. No -q so we
  // can stream "  adding: <path>" lines as progress.
  let n = 0;
  await runStreaming('zip', ['-X', '-r', destZip, ...present], ROOT, (line) => {
    const m = line.match(/^\s*adding:\s+(.+?)(?:\s+\(.*\))?\s*$/);
    if (m) onProgress?.(++n, m[1]);
  });
  return present;
}

/** Extract a backup zip back into the repo, overwriting current settings + data.
 * Streams each extracted file to `onProgress` (a gallery is thousands of files). */
export async function restoreConfigs(
  srcZip: string,
  onProgress?: ProgressFn,
): Promise<void> {
  const zip = expandHome(srcZip.trim());
  if (!zip) throw new Error('Enter the path to a backup .zip.');
  if (!existsSync(zip)) throw new Error(`No file at ${zip}`);
  // No -q so we can stream "  inflating/extracting: <path>" lines as progress.
  let n = 0;
  await runStreaming('unzip', ['-o', zip, '-d', ROOT], undefined, (line) => {
    const m = line.match(/^\s*(?:inflating|extracting|creating):\s+(.+?)\s*$/);
    if (m) onProgress?.(++n, m[1]);
  });
}

function zipToolError(err: unknown, tool: string): Error {
  const e = err as { code?: string; message?: string };
  if (e?.code === 'ENOENT') {
    return new Error(`\`${tool}\` isn't installed — install it and try again.`);
  }
  return new Error(e?.message ?? `${tool} failed`);
}
