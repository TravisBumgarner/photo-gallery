import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expandHome } from './configFiles.js';

const execFileP = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** The gitignored config/secret files worth backing up. Paths are relative to
 * ROOT so the zip restores them straight back into place. */
export const CONFIG_FILES = [
  'offline-processing/.cli-cache', // pipeline config
  'backend/.env', // serving config (gallery password, session secret)
  '.deploy-params.json', // deploy SSH host/key/dir
  '.orchestrator-prefs.json', // remembered menu selections
];

/** ~/Downloads (works across macOS/Windows/Linux home layouts). */
export function downloadsDir(): string {
  return path.join(os.homedir(), 'Downloads');
}

export function defaultBackupPath(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(downloadsDir(), `photo-gallery-settings-${stamp}.zip`);
}

/** Zip the present config files into `destZip`. Returns the files included.
 * Throws if there's nothing to back up or `zip` isn't available. */
export async function backupConfigs(destZip: string): Promise<string[]> {
  const present = CONFIG_FILES.filter((f) => existsSync(path.join(ROOT, f)));
  if (present.length === 0) {
    throw new Error('No settings to back up yet — run setup first.');
  }
  await mkdir(path.dirname(destZip), { recursive: true });
  try {
    // -X drops extra file attributes; archive paths are relative to ROOT (cwd),
    // so unzip restores them to the right place.
    await execFileP('zip', ['-X', '-q', destZip, ...present], { cwd: ROOT });
  } catch (err) {
    throw zipToolError(err, 'zip');
  }
  return present;
}

/** Extract a settings zip back into the repo, overwriting current configs. */
export async function restoreConfigs(srcZip: string): Promise<void> {
  const zip = expandHome(srcZip.trim());
  if (!zip) throw new Error('Enter the path to a settings .zip.');
  if (!existsSync(zip)) throw new Error(`No file at ${zip}`);
  try {
    await execFileP('unzip', ['-o', '-q', zip, '-d', ROOT]);
  } catch (err) {
    throw zipToolError(err, 'unzip');
  }
}

function zipToolError(err: unknown, tool: string): Error {
  const e = err as { code?: string; message?: string };
  if (e?.code === 'ENOENT') {
    return new Error(`\`${tool}\` isn't installed — install it and try again.`);
  }
  return new Error(e?.message ?? `${tool} failed`);
}
