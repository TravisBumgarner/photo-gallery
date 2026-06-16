import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const IMAGE_RE = /\.(jpe?g|png|gif|bmp|tiff?|webp)$/i;

function expandHome(p: string): string {
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
}

/** True if `dir` contains at least one image, searching a few levels deep. */
function hasPhotos(dir: string, depth = 4): boolean {
  let entries: ReturnType<typeof readdirSync>;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
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

export interface Field {
  key: string;
  label: string;
  default?: string;
  secret?: boolean;
  when?: (v: Record<string, string>) => boolean;
  /** Return an error message to block advancing, or null when valid. */
  validate?: (value: string) => string | null;
  /** One-line explanation shown under the prompt. */
  hint?: string;
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
    hint: 'Run `ollama serve` locally, or point at another machine (e.g. http://192.168.1.63:11434).',
  },
  { key: 'MODEL_SERVER_MODEL', label: 'Vision-LLM model name (e.g. llama3.2-vision)', default: '' },
  { key: 'MODEL_SERVER_API_KEY', label: 'Vision-LLM API key (optional)', secret: true, default: '' },
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
