import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Private keys in ~/.ssh, offered as a pick-list (a private key is a file with
 * a matching .pub). The first option is "default" — let ssh use its agent /
 * ~/.ssh/config / default identities. */
export function listSshKeys(): { label: string; value: string }[] {
  const dir = path.join(os.homedir(), '.ssh');
  const opts = [{ label: 'Default (ssh agent / ~/.ssh/config)', value: '' }];
  try {
    const names = new Set(readdirSync(dir));
    for (const name of names) {
      if (name.endsWith('.pub')) continue;
      if (!names.has(`${name}.pub`)) continue; // only files with a public half
      opts.push({ label: name, value: path.join(dir, name) });
    }
  } catch {
    // no ~/.ssh — just the default option
  }
  return opts;
}

/** Actually try to SSH in (key auth only, like the deploy will). With `keyFile`
 * set, uses that identity (`ssh -i`) — so a non-default NFSN key is honored.
 * Resolves null on success, or an actionable message — the wizard verifies
 * access itself instead of telling the user to go test by hand. */
export function checkSshHost(
  host: string,
  keyFile?: string,
): Promise<string | null> {
  return new Promise((resolve) => {
    const args = [
      '-o',
      'BatchMode=yes', // never prompt for a password — key auth or fail
      '-o',
      'ConnectTimeout=8',
      '-o',
      'StrictHostKeyChecking=accept-new', // don't fail purely on a new host key
    ];
    if (keyFile) args.push('-i', keyFile);
    args.push(host, 'true');
    const child = spawn('ssh', args, {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let err = '';
    child.stderr?.on('data', (b) => {
      err += b.toString();
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), 12000);
    child.on('error', () => {
      clearTimeout(timer);
      resolve('Couldn’t run ssh — is OpenSSH installed and on PATH?');
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(null);
        return;
      }
      const e = err.toLowerCase();
      if (e.includes('permission denied')) {
        // A host with no user and no ssh-config match is the usual culprit:
        // ssh silently uses the laptop username, which NFSN rejects.
        const bareNote = host.includes('@')
          ? ''
          : ` “${host}” has no user — unless it’s an ~/.ssh/config alias, ssh is using your laptop name. Try member_site@host.`;
        resolve(
          `Reached ${host} but auth failed.${bareNote} Otherwise pick the matching key, and make sure its public half is in the NFSN panel (Profile → SSH Keys).`,
        );
      } else if (
        e.includes('could not resolve') ||
        e.includes('name or service not known') ||
        e.includes('nodename nor servname')
      ) {
        resolve(`Can’t resolve that host — check the hostname in “${host}”.`);
      } else if (
        e.includes('connection refused') ||
        e.includes('timed out') ||
        e.includes('timeout')
      ) {
        resolve(`Couldn’t reach ${host} (connection refused / timed out).`);
      } else {
        resolve(
          `SSH to ${host} failed: ${err.trim().split('\n').pop() || `exit ${code}`}`,
        );
      }
    });
  });
}
// Per-target deploy answers (SSH host, remote dir, …). Gitignored — keep host
// details out of the repo. Re-running the deploy pre-fills from here.
const PARAMS_FILE = path.join(ROOT, '.deploy-params.json');

export interface DeployParam {
  key: string;
  label: string;
  default?: string;
  hint?: string;
  /** Clean up the entered value before validation + save (e.g. add a missing
   * https:// scheme), so the user doesn't get bounced for a fixable typo. */
  normalize?: (value: string) => string;
  /** Render a pick-list instead of a text input (computed at render time, e.g.
   * the SSH keys found in ~/.ssh). */
  options?: () => { label: string; value: string }[];
  /** Return an error to block, or null when valid. Receives the answers so far
   * (e.g. the key check needs the host). May be async. */
  validate?: (
    value: string,
    values: Record<string, string>,
  ) => string | null | Promise<string | null>;
}

/** The env params each supported (non-localhost) deploy script needs. A target
 * absent here has no automated deploy yet → the wizard shows its guide instead. */
export const DEPLOY_PARAMS: Record<string, DeployParam[]> = {
  nearlyfreespeech: [
    {
      key: 'DEPLOY_SSH_HOST',
      label: 'Server address',
      hint: 'Example: youruser_yoursite@ssh.nyc1.nearlyfreespeech.net',
      validate: (v) =>
        !v.trim()
          ? 'Required.'
          : /\s/.test(v.trim())
            ? 'No spaces — use member_site@host or an ssh-config alias.'
            : null,
    },
    {
      key: 'DEPLOY_SSH_KEY',
      label: 'SSH key',
      default: '',
      options: listSshKeys,
      hint: 'Which key connects to the server — picking it tests the connection.',
      // Live connection test — needs both host and key, so it lives here (the
      // host field only format-checks). Empty key = default identities.
      validate: async (key, v) => {
        const host = (v.DEPLOY_SSH_HOST ?? '').trim();
        if (!host) return 'Enter the SSH host first.';
        if (key && !existsSync(key)) return `No key file at ${key}.`;
        return checkSshHost(host, key || undefined);
      },
    },
    {
      key: 'DEPLOY_REMOTE_DIR',
      label: 'Remote directory',
      default: '/home/protected',
      hint: 'Where files live on the server.',
      validate: (v) =>
        v.trim().startsWith('/') ? null : 'Absolute path required (starts with /).',
    },
    {
      key: 'DEPLOY_SITE_URL',
      label: 'Gallery web address',
      default: '',
      hint: 'Where people will visit it — https:// is added if you leave it off.',
      // Accept a bare hostname (photo-gallery.nfshost.com) and add the scheme.
      normalize: (v) => {
        const t = v.trim();
        if (!t) return t;
        return /^https?:\/\//i.test(t) ? t : `https://${t.replace(/^\/+/, '')}`;
      },
      validate: (v) =>
        v.trim() ? null : 'Required — e.g. photo-gallery.nfshost.com',
    },
  ],
};

/** Absolute path to a target's runnable app-deploy script. */
export function deployScriptPath(target: string): string {
  return path.join(ROOT, 'templates', target, 'deploy.sh');
}

/** Absolute path to a target's data-publish script (photos + DB). */
export function pushScriptPath(target: string): string {
  return path.join(ROOT, 'templates', target, 'push.sh');
}

type Store = Record<string, Record<string, string>>;

function readStore(): Store {
  try {
    return JSON.parse(readFileSync(PARAMS_FILE, 'utf8')) as Store;
  } catch {
    return {};
  }
}

/** Saved params for a target, back-filled with each param's default. */
export function loadDeployParams(target: string): Record<string, string> {
  const saved = readStore()[target] ?? {};
  const out: Record<string, string> = {};
  for (const p of DEPLOY_PARAMS[target] ?? []) {
    out[p.key] = saved[p.key] ?? p.default ?? '';
  }
  return out;
}

export function saveDeployParams(
  target: string,
  values: Record<string, string>,
): void {
  const store = readStore();
  store[target] = values;
  writeFileSync(PARAMS_FILE, `${JSON.stringify(store, null, 2)}\n`);
}
