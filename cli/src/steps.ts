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

/** The two ways to run the pipeline:
 *   process — ingest whatever's new in staging, then (re)run compute. Resumable:
 *             re-running picks up new photos and finishes anything unfinished.
 *   create  — wipe, then re-ingest the whole library (incl. the archive) + recompute. */
export type RunMode = 'process' | 'create';

/** Move photos from an import-from folder into the staging inbox (the Add step,
 * run on its own — separate from processing). */
export function importStep(importDir: string): Step {
  return {
    id: 'import-photos',
    label: 'Import photos into staging',
    spec: {
      cmd: 'npx',
      args: ['tsx', path.join(ROOT, 'cli/src/importPhotos.ts'), importDir],
      cwd: ROOT,
    },
  };
}

/** Move processed originals out of staging into _already_processed (add/create). */
export function archiveStep(): Step {
  return {
    id: 'archive',
    label: 'Archive processed originals',
    spec: {
      cmd: 'npx',
      args: ['tsx', path.join(ROOT, 'cli/src/archivePhotos.ts')],
      cwd: ROOT,
    },
  };
}

/** Ingest the staging library. Start over also re-ingests the archive. */
function ingestStep(mode: RunMode): Step {
  return {
    id: 'ingest',
    label: 'Ingest photos',
    spec: {
      cmd: 'npm',
      args: ['run', 'ingest'],
      cwd: OP_DIR,
      ...(mode === 'create' ? { env: { INGEST_INCLUDE_ARCHIVE: '1' } } : {}),
    },
  };
}

/** The full compute pipeline — always tag + faces + dogs (no per-task picking). */
export function processSteps(mode: RunMode): Step[] {
  const steps: Step[] = [];
  // Up-front readiness — fail here, before the hours-long work.
  steps.push(preflightModelStep());
  steps.push(visionServerStep());

  // Seed the working DB from the published backup if missing (fresh machine that
  // pulled data/out). Skipped on "start over", which recomputes from scratch.
  if (mode !== 'create') {
    steps.push(task('restore', 'Restore database from backup'));
  }
  steps.push(task('migrate', 'Prepare database')); // idempotent
  steps.push(task('prefetch-embedder', 'Preparing search'));
  if (mode === 'create') steps.push(task('clear-local-db', 'Wipe local data'));
  // Always ingest: a no-op when staging is empty (dedup by content hash), so it
  // safely picks up new photos and resumes after an interruption.
  steps.push(ingestStep(mode));
  steps.push(task('tag', 'Tagging photos'));
  steps.push(task('detect-faces', 'Detect faces'));
  steps.push(task('cluster-faces', 'Cluster faces'));
  steps.push(task('detect-dogs', 'Detect dogs'));
  steps.push(task('cluster-dogs', 'Cluster dogs'));
  steps.push(task('reapply-labels', 'Restoring your labels'));
  return steps;
}

/** Up-front check that STORAGE_URL is reachable + writable, so it fails fast. */
export function storageCheckStep(): Step {
  return task('check-storage', 'Check storage');
}

/** Publish runs after labeling so newly-named clusters are included. */
export function publishStep(): Step {
  return task('publish', 'Publishing');
}
