import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
export const OP_DIR = path.join(ROOT, 'offline-processing');
export const FRONTEND_DIR = path.join(ROOT, 'frontend');
export const BACKEND_DIR = path.join(ROOT, 'backend');

export interface Spec {
  cmd: string;
  args: string[];
  cwd: string;
  /** Extra env merged over the parent's (e.g. deploy params for a script). */
  env?: Record<string, string>;
}

export interface Step {
  id: string;
  label: string;
  spec: Spec;
}

/** A pipeline task: a native subprocess in the offline-processing workspace
 * (reads config from .cli-cache there). No container. */
function task(id: string, label: string): Step {
  return { id, label, spec: { cmd: 'npm', args: ['run', id], cwd: OP_DIR } };
}

/** Runs first when tagging: ensure Ollama is up and the model is pulled (starts
 * + pulls for a local host), failing fast before any ingest work. */
function preflightModelStep(): Step {
  return {
    id: 'preflight-model',
    label: 'Ensure tagging model (Ollama)',
    spec: {
      cmd: 'npx',
      args: ['tsx', path.join(ROOT, 'cli/src/preflightModel.ts')],
      cwd: ROOT,
    },
  };
}

/** The one Docker touch: bring up the Python detection sidecar, only when
 * faces/dogs are requested. */
function visionServerStep(): Step {
  return {
    id: 'vision-server',
    label: 'Start detection service (Docker)',
    spec: {
      cmd: 'npx',
      args: ['tsx', path.join(ROOT, 'cli/src/ensureVisionServer.ts')],
      cwd: ROOT,
    },
  };
}

export type SourceAdapter = 'lightroom' | 'manual';

export interface ProcessOpts {
  mode: 'create' | 'update';
  ingest: boolean;
  tag: boolean;
  faces: boolean;
  dogs: boolean;
}

/** Source phase: get photos into the ingest folder. Manual = already there.
 * The Lightroom export folder is collected (and dry-tested) by the wizard and
 * passed in here, so prepareLightroom runs non-interactively. */
export function sourceSteps(adapter: SourceAdapter, lightroomDir = ''): Step[] {
  if (adapter === 'lightroom') {
    return [
      {
        id: 'prepare-lightroom',
        label: 'Move Lightroom exports into the ingest folder',
        spec: {
          cmd: 'npx',
          args: ['tsx', path.join(ROOT, 'cli/src/prepareLightroom.ts'), lightroomDir],
          cwd: ROOT,
        },
      },
    ];
  }
  return [];
}

/** Process phase: the offline pipeline, mirroring ./oi's task order. */
export function processSteps(opts: ProcessOpts): Step[] {
  const steps: Step[] = [];
  // Up-front readiness — everything that can fail must fail here, before the
  // hours-long ingest/tag/detect work, so a walk-away run never dies at hour 3.
  if (opts.tag) steps.push(preflightModelStep());
  if (opts.faces || opts.dogs) steps.push(visionServerStep());

  // Seed the working DB from the published backup if it's missing (fresh/wiped
  // machine that pulled data/out) — before migrate so its schema gets topped up.
  // Skipped on "start over", which deliberately recomputes from scratch.
  if (opts.mode !== 'create') {
    steps.push(task('restore', 'Restore database from backup'));
  }
  steps.push(task('migrate', 'Prepare database')); // idempotent
  if (opts.tag) steps.push(task('prefetch-embedder', 'Fetch text-embedding model'));
  if (opts.mode === 'create') steps.push(task('clear-local-db', 'Wipe local data'));
  if (opts.ingest) {
    steps.push(task('ingest', 'Ingest photos'));
  }
  if (opts.tag) steps.push(task('tag', 'Text-tag + embed'));
  if (opts.faces) {
    steps.push(task('detect-faces', 'Detect faces'));
    steps.push(task('cluster-faces', 'Cluster faces'));
  }
  if (opts.dogs) {
    steps.push(task('detect-dogs', 'Detect dogs'));
    steps.push(task('cluster-dogs', 'Cluster dogs'));
  }
  if (opts.faces || opts.dogs) {
    steps.push(task('reapply-labels', 'Reattach saved labels'));
  }
  return steps;
}

/** Up-front check that the online gallery destination is reachable + writable,
 * so a bad bucket/credentials fails fast instead of hours later at publish/sync. */
export function storageCheckStep(): Step {
  return task('check-storage', 'Check online gallery');
}

/** Publish runs after labeling so newly-named clusters are included. */
export function publishStep(): Step {
  return task('publish', 'Publish read-only release');
}

/** Sync phase: push media to storage (publish already pushed the fat + slim DB
 * and labels to STORAGE_URL). */
export function syncSteps(): Step[] {
  return [task('sync-media', 'Push media to storage')];
}
