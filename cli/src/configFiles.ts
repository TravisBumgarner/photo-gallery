import { randomBytes } from 'node:crypto';
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
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
  blurb: string;
}
export const DEPLOY_TARGETS: DeployTarget[] = [
  {
    value: 'localhost',
    label: 'This computer',
    blurb: 'Run everything locally — no remote host.',
  },
  {
    value: 'nearlyfreespeech',
    label: 'NearlyFreeSpeech',
    blurb: 'Cheap persistent host: rsync up, run the backend as a daemon.',
  },
];

/** Absolute path to a target's deploy guide. */
export function deployGuidePath(target: string): string {
  return path.join(TEMPLATES_DIR, target, 'deploy.md');
}

const CLI_CACHE = path.join(ROOT, 'offline-processing', '.cli-cache');
const BACKEND_ENV = path.join(ROOT, 'backend', '.env');
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
const REQUIRED_CLI_KEYS = ['SOURCE_DIR', 'DESTINATION_DIRECTORY', 'DATABASE_URL'];

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
    label: 'Where will you host the gallery?',
    default: 'localhost',
    options: DEPLOY_TARGETS.map((t) => ({ label: t.label, value: t.value })),
    hint: 'This computer, or NearlyFreeSpeech (rsync up + run as a daemon).',
  },
  {
    key: 'SOURCE_DIR',
    label: 'Photo source folder (absolute path)',
    path: true,
    hint: `Where your photos are. Reads ${SUPPORTED_IMAGE_FORMATS} — not HEIC or RAW (convert those first). Using Lightroom? Pick any empty folder; your exports get moved here for you.`,
    validate: (raw) => {
      const p = expandHome(raw.trim());
      if (!p) return 'Required.';
      if (existsSync(p) && !statSync(p).isDirectory()) return `Not a folder: ${p}`;
      return null;
    },
    // "Missing folder" / "no images" are advisory, not blocking: with Lightroom
    // this folder is empty (or not created yet) until exports move into it.
    advise: (raw) => {
      const p = expandHome(raw.trim());
      if (!existsSync(p))
        return 'Folder doesn’t exist yet — fine for Lightroom (created when exports move in); double-check it for a prepared folder. Enter again to keep it.';
      if (!hasPhotos(p))
        return 'No images here yet — fine for Lightroom (exports land here later); double-check it for a manual folder. Enter again to keep it.';
      return null;
    },
  },
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
    label: 'Vision-LLM model',
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
  const cliCache = `${[
    `DEPLOY_TARGET=${v.DEPLOY_TARGET || 'localhost'}`,
    `SOURCE_DIR=${v.SOURCE_DIR}`,
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
  return { cliCache: CLI_CACHE, backendEnv: BACKEND_ENV };
}
