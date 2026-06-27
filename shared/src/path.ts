import os from 'node:os';
import path from 'node:path';

/**
 * Expand a leading `~` to the current user's home directory. The single shared
 * implementation used by every package — the CLI and the offline pipeline run
 * over the *same* config paths (DATABASE_URL, DESTINATION_DIRECTORY, …), so they
 * must agree byte-for-byte on how a path expands.
 *
 * Only `~` and `~/…` are expanded. `~otheruser/…` is intentionally NOT supported
 * (resolving another user's home needs a passwd lookup and is OS-specific); it's
 * returned unchanged rather than mis-expanded to `<home>/otheruser/…`. Use an
 * absolute path for anything other than the current user's home.
 */
export function expandHome(p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}
