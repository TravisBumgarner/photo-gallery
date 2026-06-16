import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const OI_DIR = path.join(ROOT, 'offline-ingestion');

export interface Spec {
  cmd: string;
  args: string[];
  cwd: string;
}

export interface Step {
  id: string;
  label: string;
  spec: Spec;
}

/** A pipeline task: a native subprocess in the offline-ingestion workspace
 * (reads config from .cli-cache there). No container. */
function task(id: string, label: string): Step {
  return { id, label, spec: { cmd: 'npm', args: ['run', id], cwd: OI_DIR } };
}

/** The one Docker touch: bring up the Python detection sidecar, only when
 * faces/dogs are requested. */
function visionServerStep(): Step {
  return {
    id: 'vision-server',
    label: 'Start detection service (Docker)',
    spec: { cmd: 'docker', args: ['compose', 'up', '-d', 'vision-server'], cwd: OI_DIR },
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

/** Source phase: get photos into the ingest folder. Manual = already there. */
export function sourceSteps(adapter: SourceAdapter): Step[] {
  if (adapter === 'lightroom') {
    return [
      {
        id: 'prepare-lightroom',
        label: 'Move Lightroom exports into the ingest folder',
        spec: { cmd: './prepare-lightroom', args: [], cwd: OI_DIR },
      },
    ];
  }
  return [];
}

/** Process phase: the offline pipeline, mirroring ./oi's task order. */
export function processSteps(opts: ProcessOpts): Step[] {
  const steps: Step[] = [];
  steps.push(task('migrate', 'Prepare database')); // idempotent
  if (opts.tag) steps.push(task('prefetch-embedder', 'Fetch text-embedding model'));
  if (opts.mode === 'create') steps.push(task('clear-local-db', 'Wipe local data'));
  if (opts.ingest) {
    steps.push(task('ingest', 'Ingest photos'));
    steps.push(task('restore', 'Restore compute from sidecars'));
  }
  if (opts.tag) steps.push(task('tag', 'Text-tag + embed'));
  if (opts.faces || opts.dogs) steps.push(visionServerStep());
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
  steps.push(task('publish', 'Publish read-only release'));
  return steps;
}

/** Sync phase: push media to the bucket (publish already pushed the DB +
 * sidecars + labels to STORAGE_URL). */
export function syncSteps(): Step[] {
  return [task('sync-media', 'Push media to the bucket')];
}
