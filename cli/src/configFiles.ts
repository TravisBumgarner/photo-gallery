import { randomBytes } from 'node:crypto';
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const IMAGE_RE = /\.(jpe?g|png|gif|bmp|tiff?|webp)$/i;

function expandHome(p: string): string {
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
}

function listDir(dir: string) {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** True if `dir` contains at least one image, searching a few levels deep. */
function hasPhotos(dir: string, depth = 4): boolean {
  const entries = listDir(dir);
  for (const e of entries) if (e.isFile() && IMAGE_RE.test(e.name)) return true;
  if (depth > 0) {
    for (const e of entries) {
      if (e.isDirectory() && hasPhotos(path.join(dir, e.name), depth - 1)) {
        return true;
      }
    }
  }
  return false;
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CLI_CACHE = path.join(ROOT, 'offline-ingestion', '.cli-cache');
const BACKEND_ENV = path.join(ROOT, 'backend', '.env');
// Native data layout (no container paths). Ingest writes here; publish reads it.
const DATA_DIR = path.join(ROOT, 'data');
const DEST_DIR = path.join(DATA_DIR, 'out');
const INGEST_DB = path.join(DATA_DIR, 'ingest.sqlite');
const SERVED_DB = path.join(DATA_DIR, 'served.sqlite');

/** First-run setup is needed when either config file is missing. */
export function needsSetup(): boolean {
  return !existsSync(CLI_CACHE) || !existsSync(BACKEND_ENV);
}

function parseEnvFile(p: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2];
    }
  } catch {
    // missing file → no existing values
  }
  return out;
}

/** Current values from the config files, so setup can pre-fill them. */
export function loadExistingValues(): Record<string, string> {
  return { ...parseEnvFile(BACKEND_ENV), ...parseEnvFile(CLI_CACHE) };
}

/** One-time fix for configs written under the old Docker model: the pipeline
 * runs natively now, so host.docker.internal never resolves — rewrite it to
 * localhost. Returns true if anything changed. */
export function migrateConfig(): boolean {
  let changed = false;
  for (const p of [CLI_CACHE, BACKEND_ENV]) {
    try {
      const orig = readFileSync(p, 'utf8');
      const fixed = orig.replaceAll('host.docker.internal', 'localhost');
      if (fixed !== orig) {
        writeFileSync(p, fixed);
        changed = true;
      }
    } catch {
      // missing file → nothing to migrate
    }
  }
  return changed;
}

export interface Field {
  key: string;
  label: string;
  default?: string;
  secret?: boolean;
  when?: (v: Record<string, string>) => boolean;
  /** Return an error message to block advancing, or null when valid. May be
   * async (e.g. to check a model server). Receives values answered so far. */
  validate?: (
    value: string,
    values: Record<string, string>,
  ) => string | null | Promise<string | null>;
  /** One-line explanation shown under the prompt. */
  hint?: string;
  /** Non-blocking warning (e.g. model may not fit in RAM). Shown on first
   * enter; a second enter on the same value proceeds anyway. */
  advise?: (
    value: string,
    values: Record<string, string>,
  ) => string | null | Promise<string | null>;
}

const isS3 = (v: Record<string, string>) => !!v.STORAGE_URL?.startsWith('s3://');

export const FIELDS: Field[] = [
  {
    key: 'SOURCE_DIR',
    label: 'Photo source folder (absolute path)',
    validate: (raw) => {
      const p = expandHome(raw.trim());
      if (!p) return 'Required.';
      if (!existsSync(p)) return `No such folder: ${p}`;
      if (!statSync(p).isDirectory()) return `Not a folder: ${p}`;
      if (!hasPhotos(p)) return 'No images found in that folder.';
      return null;
    },
  },
  {
    key: 'STORAGE_URL',
    label: 'Storage URL — blank = local disk, or s3://bucket/prefix',
    default: '',
  },
  { key: 'STORAGE_S3_ENDPOINT', label: 'S3 endpoint (R2/Spaces/MinIO; blank for AWS)', default: '', when: isS3 },
  { key: 'STORAGE_S3_REGION', label: 'S3 region', default: 'us-east-1', when: isS3 },
  { key: 'STORAGE_S3_ACCESS_KEY_ID', label: 'S3 access key id', when: isS3 },
  { key: 'STORAGE_S3_SECRET_ACCESS_KEY', label: 'S3 secret access key', secret: true, when: isS3 },
  {
    key: 'MODEL_SERVER_HOST',
    label: 'Vision-LLM host (for tagging)',
    default: 'http://localhost:11434',
    hint: 'Local: Ollama is started + the model pulled for you. Remote (http://IP:11434): health-checked here until it responds.',
    validate: async (host) => {
      if (!host) return 'Required.';
      if (/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(host)) return null; // local: started for you
      const h = host.replace(/\/+$/, '');
      try {
        const res = await fetch(`${h}/api/tags`, {
          signal: AbortSignal.timeout(4000),
        });
        return res.ok ? null : `${h} returned ${res.status}.`;
      } catch {
        return `Can't reach ${h} yet — start Ollama there, then press enter to retry.`;
      }
    },
  },
  {
    key: 'MODEL_SERVER_MODEL',
    label: 'Vision-LLM model name (e.g. llama3.2-vision)',
    default: '',
    hint: 'Leave blank to skip tagging. If set, it must be pulled on the host.',
    validate: async (model, values) => {
      if (!model) return null; // blank = skip tagging
      const host = (values.MODEL_SERVER_HOST || 'http://localhost:11434').replace(
        /\/+$/,
        '',
      );
      const local = /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(host);
      try {
        const res = await fetch(`${host}/api/tags`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return local ? null : `${host} returned ${res.status}.`;
        const data = (await res.json()) as { models?: { name: string }[] };
        const base = (s: string) => s.split(':')[0];
        const names = (data.models ?? []).map((m) => m.name);
        if (!names.some((n) => n === model || base(n) === base(model))) {
          // Local: it'll be pulled automatically. Remote: we can't pull for them.
          if (local) return null;
          const avail = names.map(base).join(', ');
          return `"${model}" not on ${host}. ${avail ? `Available: ${avail}` : 'Pull it there.'}`;
        }
        return null;
      } catch {
        return local ? null : `Can't reach ${host}.`;
      }
    },
    advise: async (model, values) => {
      if (!model) return null;
      const host = (values.MODEL_SERVER_HOST || 'http://localhost:11434').replace(
        /\/+$/,
        '',
      );
      try {
        const res = await fetch(`${host}/api/tags`, {
          signal: AbortSignal.timeout(5000),
        });
        const data = (await res.json()) as {
          models?: { name: string; size?: number }[];
        };
        const base = (s: string) => s.split(':')[0];
        const entry = (data.models ?? []).find(
          (m) => m.name === model || base(m.name) === base(model),
        );
        if (!entry?.size) return null;
        const modelGB = entry.size / 1e9;
        const ramGB = os.totalmem() / 1e9;
        // Weights (~disk size) + KV cache/overhead need to fit; risky past ~65%.
        if (modelGB > ramGB * 0.65) {
          return `${modelGB.toFixed(1)} GB model vs ${ramGB.toFixed(0)} GB RAM — likely to run out of memory and get killed. Consider a smaller model. Enter again to try anyway.`;
        }
        return null;
      } catch {
        return null; // advisory only; never block on a failed check
      }
    },
  },
  {
    key: 'MODEL_SERVER_API_KEY',
    label: 'Vision-LLM API key',
    secret: true,
    default: '',
    // Only a remote/authenticated host needs a key; local Ollama doesn't.
    when: (v) => !/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(v.MODEL_SERVER_HOST ?? 'localhost'),
  },
  { key: 'APP_PASSWORD', label: 'Gallery password (serving login)', secret: true },
];

/** Field defs that apply given the values collected so far. */
export function applicableFields(values: Record<string, string>): Field[] {
  return FIELDS.filter((f) => !f.when || f.when(values));
}

/** Write .cli-cache (pipeline) and backend/.env (serving) from setup answers. */
export function writeConfigFiles(v: Record<string, string>): {
  cliCache: string;
  backendEnv: string;
} {
  const line = (k: string) => (v[k] ? `${k}=${v[k]}` : '');
  const cliCache = `${[
    `SOURCE_DIR=${v.SOURCE_DIR}`,
    `DESTINATION_DIRECTORY=${DEST_DIR}`,
    `DATABASE_URL=${INGEST_DB}`,
    line('STORAGE_URL'),
    line('STORAGE_S3_ENDPOINT'),
    line('STORAGE_S3_REGION'),
    line('STORAGE_S3_ACCESS_KEY_ID'),
    line('STORAGE_S3_SECRET_ACCESS_KEY'),
    `MODEL_SERVER_HOST=${v.MODEL_SERVER_HOST}`,
    `MODEL_SERVER_MODEL=${v.MODEL_SERVER_MODEL ?? ''}`,
    line('MODEL_SERVER_API_KEY'),
  ]
    .filter(Boolean)
    .join('\n')}\n`;

  const backendEnv = `${[
    'PORT=8084',
    'NODE_ENV=production',
    `DATABASE_URL=${SERVED_DB}`,
    `SESSION_SECRET=${randomBytes(32).toString('hex')}`,
    `APP_PASSWORD=${v.APP_PASSWORD}`,
    'CORS_ORIGIN=*',
    `STORAGE_URL=${v.STORAGE_URL || `file://${DEST_DIR}`}`,
  ]
    .filter(Boolean)
    .join('\n')}\n`;

  writeFileSync(CLI_CACHE, cliCache);
  writeFileSync(BACKEND_ENV, backendEnv);
  return { cliCache: CLI_CACHE, backendEnv: BACKEND_ENV };
}
