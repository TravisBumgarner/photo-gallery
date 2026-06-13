import os from 'node:os';
import path from 'node:path';

// Expand a leading ~ to the user's home directory.
export function expandHome(p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}
