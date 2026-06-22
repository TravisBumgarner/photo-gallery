import { randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const IMAGE_RE = /\.(jpe?g|png|gif|bmp|tiff?|webp)$/i;
/** Human-readable list of the formats the pipeline ingests (mirrors
 * offline-processing/src/scan.ts VALID_IMAGE_EXTENSIONS). HEIC/RAW are skipped. */
export const SUPPORTED_IMAGE_FORMATS = 'JPG, PNG, GIF, BMP, TIFF, WebP';
// The "To Mobile Photo Gallery" preset renames every export to this suffix.
const VIEWING_RE = /_exported_for_viewing_locally\.[^.]+$/i;

export function expandHome(p: string): string {
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
}

/** Case-insensitive tab completion for a partial directory path. Expands ~,
 * completes against subdirectories of the deepest existing parent. A single
 * match is filled and gets a trailing slash; multiple matches fill the common
 * prefix; no match leaves the input unchanged. */
export function completePath(input: string): string {
  const expanded = expandHome(input);
  const slash = expanded.lastIndexOf('/');
  const dir = slash >= 0 ? expanded.slice(0, slash + 1) : './';
  const partial = (slash >= 0 ? expanded.slice(slash + 1) : expanded).toLowerCase();
  let names: string[];
  try {
    names = readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return input;
  }
  const matches = names.filter((n) => n.toLowerCase().startsWith(partial));
  if (matches.length === 0) return input;
  if (matches.length === 1) return `${dir}${matches[0]}/`;
  // Longest common prefix (case-insensitive), keeping the first match's casing.
  let common = matches[0];
  for (const m of matches.slice(1)) {
    let i = 0;
    while (
      i < common.length &&
      i < m.length &&
      common[i].toLowerCase() === m[i].toLowerCase()
    ) {
      i++;
    }
    common = common.slice(0, i);
  }
  return `${dir}${common}`;
}

function listDir(dir: string) {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/** The Lightroom export preset the user imports, then exports with. */
export const LIGHTROOM_PRESET = path.join(
  ROOT,
  'lightroom-export-presets',
  'To Mobile Photo Gallery.lrtemplate',
);
/** Per-host deploy guides live here, one folder per target. */
export const TEMPLATES_DIR = path.join(ROOT, 'templates');

export interface DeployTarget {
  value: string;
  label: string;
}
export const DEPLOY_TARGETS: DeployTarget[] = [
  { value: 'localhost', label: 'This computer' },
  { value: 'nearlyfreespeech', label: 'NearlyFreeSpeech' },
];

/** Absolute path to a target's deploy guide. */
export function deployGuidePath(target: string): string {
  return path.join(TEMPLATES_DIR, target, 'deploy.md');
}

const CLI_CACHE = path.join(ROOT, 'offline-processing', '.cli-cache');
const BACKEND_ENV = path.join(ROOT, 'backend', '.env');
/** Fixed staging inbox — photos awaiting ingestion live here, then move to the
 * _already_processed archive after ingest. Not a user setting; it's always
 * <repo root>/pending-ingestion. Mirrors offline-processing/src/config.ts. */
export const STAGING_DIR = path.join(ROOT, 'pending-ingestion');
// Native data layout (no container paths). Ingest writes here; publish reads it.
const DATA_DIR = path.join(ROOT, 'data');
const DEST_DIR = path.join(DATA_DIR, 'out');
const INGEST_DB = path.join(DATA_DIR, 'ingest.sqlite');
const SERVED_DB = path.join(DATA_DIR, 'served.sqlite');

// TEMPORARY (remove after the testing push): wipe ALL local state back to a
// fresh-checkout state so an end-to-end run can be repeated from zero. Removes
// config (.cli-cache, backend/.env), remembered selections, the whole data dir
// (ingest/served DBs, published output, model cache), and the shutdown marker.
// Does NOT touch node_modules or any remote/bucket data.
export function nukeEverything(): string[] {
  const targets = [
    CLI_CACHE,
    BACKEND_ENV,
    path.join(ROOT, '.orchestrator-prefs.json'),
    DATA_DIR,
    path.join(os.tmpdir(), 'photo-gallery-cleanup.json'),
  ];
  const removed: string[] = [];
  for (const p of targets) {
    try {
      if (existsSync(p)) {
        rmSync(p, { recursive: true, force: true });
        removed.push(p);
      }
    } catch {
      // best-effort
    }
  }
  return removed;
}

// Keys the pipeline can't run without. An older-format .cli-cache may exist yet
// lack these (they're written by the current writeConfigFiles) — checking only
// for file existence let such a cache crash deep in the run (loadConfig's zod
// parse) instead of failing the up-front setup gate.
const REQUIRED_CLI_KEYS = ['DESTINATION_DIRECTORY', 'DATABASE_URL'];

/** Setup is needed when a config file is missing OR is an older/partial format
 * lacking a required key — either way, run the (pre-filled) setup wizard. */
export function needsSetup(): boolean {
  if (!existsSync(CLI_CACHE) || !existsSync(BACKEND_ENV)) return true;
  const cli = parseEnvFile(CLI_CACHE);
  return REQUIRED_CLI_KEYS.some((k) => !cli[k]);
}

/** Count image files under `dir`, a few levels deep. */
function countImages(dir: string, depth = 4): number {
  let n = 0;
  for (const e of listDir(dir)) {
    if (e.isFile() && IMAGE_RE.test(e.name)) n++;
    else if (e.isDirectory() && depth > 0) {
      n += countImages(path.join(dir, e.name), depth - 1);
    }
  }
  return n;
}

/** Name of the post-ingest archive subfolder (mirrors scan.ts). */
const ARCHIVE_DIR_NAME = '_already_processed';

/** Count photos waiting in the staging inbox, excluding the processed archive —
 * what an ingest run would actually pick up. Used to stop a manual run that
 * would silently do nothing. */
export function countStagingPhotos(depth = 6): number {
  const walk = (dir: string, d: number): number => {
    let n = 0;
    for (const e of listDir(dir)) {
      if (e.isDirectory()) {
        if (e.name === ARCHIVE_DIR_NAME || d <= 0) continue;
        n += walk(path.join(dir, e.name), d - 1);
      } else if (e.isFile() && IMAGE_RE.test(e.name)) {
        n++;
      }
    }
    return n;
  };
  return walk(STAGING_DIR, depth);
}

/** Count exported viewing copies (*_exported_for_viewing_locally.*) anywhere
 * under `dir` — the dry test that the Lightroom export worked. Unbounded depth
 * to match prepareLightroom's recursive walk (which moves at any depth). */
export function countLightroomExports(dir: string): number {
  let n = 0;
  for (const e of listDir(dir)) {
    if (e.isFile() && VIEWING_RE.test(e.name)) n++;
    else if (e.isDirectory()) n += countLightroomExports(path.join(dir, e.name));
  }
  return n;
}

/** What a Create wipe would destroy, so the confirm can show its blast radius. */
export function blastRadius(): { photos: number; hasDb: boolean } {
  return {
    photos: countImages(path.join(DEST_DIR, 'images')),
    hasDb: existsSync(INGEST_DB),
  };
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
      let txt = orig.replaceAll('host.docker.internal', 'localhost');
      // Back-fill VISION_SERVER_HOST for configs written before it existed: the
      // Docker vision-server is published on localhost:8090 for native tasks.
      if (p === CLI_CACHE && !/^VISION_SERVER_HOST=/m.test(txt)) {
        txt = `${txt.replace(/\n?$/, '\n')}${VISION_SERVER_HOST_LINE}\n`;
      }
      if (txt !== orig) {
        writeFileSync(p, txt);
        changed = true;
      }
    } catch {
      // missing file → nothing to migrate
    }
  }
  return changed;
}

const VISION_SERVER_HOST_LINE = 'VISION_SERVER_HOST=http://localhost:8090';

export interface Field {
  key: string;
  label: string;
  default?: string;
  secret?: boolean;
  /** Render a select (instead of a text input) over these choices. */
  options?: { label: string; value: string }[];
  /** A filesystem path — enables case-insensitive Tab completion. */
  path?: boolean;
  when?: (v: Record<string, string>) => boolean;
  /** Return an error message to block advancing, or null when valid. May be
   * async (e.g. to check a model server). Receives values answered so far. */
  validate?: (
    value: string,
    values: Record<string, string>,
  ) => string | null | Promise<string | null>;
  /** One-line explanation shown under the prompt. A function can compute it
   * from the answers so far (e.g. list the models installed on the host). */
  hint?: string | ((v: Record<string, string>) => string | Promise<string>);
  /** Non-blocking warning (e.g. model may not fit in RAM). Shown on first
   * enter; a second enter on the same value proceeds anyway. */
  advise?: (
    value: string,
    values: Record<string, string>,
  ) => string | null | Promise<string | null>;
}

export const FIELDS: Field[] = [
  {
    key: 'DEPLOY_TARGET',
    label: 'Where will the gallery be hosted?',
    default: 'localhost',
    options: DEPLOY_TARGETS.map((t) => ({ label: t.label, value: t.value })),
  },
  {
    key: 'MODEL_SERVER_HOST',
    label: 'Where’s the tagging model running?',
    default: 'http://localhost:11434',
    hint: 'This computer — I’ll start it for you. Another machine — run `./model-server` there first, then enter the address it prints (see offline-processing/README.md → “Run the models on another machine”).',
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
    label: 'Tagging model',
    default: '',
    hint: async (v) => {
      const host = (v.MODEL_SERVER_HOST || 'http://localhost:11434').replace(
        /\/+$/,
        '',
      );
      try {
        const res = await fetch(`${host}/api/tags`, {
          signal: AbortSignal.timeout(4000),
        });
        const data = (await res.json()) as { models?: { name: string }[] };
        const names = (data.models ?? []).map((m) => m.name);
        if (names.length)
          return `Installed on ${host}: ${names.join(', ')}  ·  more: https://ollama.com/library`;
        return `Nothing installed on ${host} yet  ·  browse https://ollama.com/library`;
      } catch {
        return 'Browse models: https://ollama.com/library';
      }
    },
    validate: async (model, values) => {
      const host = (values.MODEL_SERVER_HOST || 'http://localhost:11434').replace(
        /\/+$/,
        '',
      );
      const local = /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(host);
      const base = (s: string) => s.split(':')[0];

      // What's installed on the host? (also called out in any error below)
      let names: string[] | null = null;
      try {
        const res = await fetch(`${host}/api/tags`, {
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const data = (await res.json()) as { models?: { name: string }[] };
          names = (data.models ?? []).map((m) => m.name);
        }
      } catch {
        names = null; // server down / unreachable
      }
      const installed =
        names && names.length ? ` Installed: ${names.join(', ')}.` : '';

      if (!model) return `Required.${installed}`;
      if (names?.some((n) => n === model || base(n) === base(model))) return null;

      if (!local) {
        if (names === null) return `Can't reach ${host}.`;
        return `"${model}" not on ${host}.${installed}`;
      }

      // Local + not installed: confirm it's a real model before the preflight
      // tries to pull it — catches typos/gibberish.
      if (model.includes('/')) return null; // namespaced; can't easily verify
      try {
        const reg = await fetch(`https://ollama.com/library/${base(model)}`, {
          signal: AbortSignal.timeout(4000),
        });
        if (reg.status === 404) {
          return `"${model}" isn't a known Ollama model — see https://ollama.com/library.${installed}`;
        }
      } catch {
        // offline / can't verify → allow (preflight will catch a bad pull)
      }
      return null;
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
    label: 'Tagging model API key',
    secret: true,
    default: '',
    // Only a remote/authenticated host needs a key; local Ollama doesn't.
    when: (v) => !/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(v.MODEL_SERVER_HOST ?? 'localhost'),
  },
  {
    key: 'APP_PASSWORD',
    label: 'Gallery password',
    secret: true,
    hint: 'Used to log into your gallery.',
  },
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
  const cliCache = `${[
    `DEPLOY_TARGET=${v.DEPLOY_TARGET || 'localhost'}`,
    `DESTINATION_DIRECTORY=${DEST_DIR}`,
    `DATABASE_URL=${INGEST_DB}`,
    VISION_SERVER_HOST_LINE,
    `MODEL_SERVER_HOST=${v.MODEL_SERVER_HOST}`,
    `MODEL_SERVER_MODEL=${v.MODEL_SERVER_MODEL ?? ''}`,
    v.MODEL_SERVER_API_KEY ? `MODEL_SERVER_API_KEY=${v.MODEL_SERVER_API_KEY}` : '',
  ]
    .filter(Boolean)
    .join('\n')}\n`;

  // localhost + nearlyfreespeech both serve media from local disk (file://).
  const backendEnv = `${[
    'PORT=8084',
    'NODE_ENV=production',
    `DATABASE_URL=${SERVED_DB}`,
    `SESSION_SECRET=${randomBytes(32).toString('hex')}`,
    `APP_PASSWORD=${v.APP_PASSWORD}`,
    'CORS_ORIGIN=*',
    `STORAGE_URL=file://${DEST_DIR}`,
    // Discriminator for the backend's boot-time config validation (per host).
    `BACKEND_SERVER=${v.DEPLOY_TARGET || 'localhost'}`,
  ]
    .filter(Boolean)
    .join('\n')}\n`;

  writeFileSync(CLI_CACHE, cliCache);
  writeFileSync(BACKEND_ENV, backendEnv);
  // The staging inbox is a fixed location; create it so manual ingestion has a
  // folder to drop photos into right after setup.
  mkdirSync(STAGING_DIR, { recursive: true });
  return { cliCache: CLI_CACHE, backendEnv: BACKEND_ENV };
}
