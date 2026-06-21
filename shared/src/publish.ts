import { copyFileSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { createDb } from './db/index.js';
import { dogClusters, dogs, faceClusters, faces, photos } from './db/schema.js';
import {
  type Anchor,
  type LabelEntry,
  type LabelsFile,
  serializeLabels,
} from './labels.js';
import { KEYS, type StorageBackend } from './storage/index.js';

/** Max member detections recorded per label as reattachment anchors. */
const ANCHORS_PER_LABEL = 25;

/** How many archived fat DBs to retain in db/backups/ (oldest pruned). */
const BACKUPS_TO_KEEP = 5;

export interface PublishOptions {
  /** Path to the authoritative (fat) ingestion DB. */
  dbPath: string;
  storage: StorageBackend;
  /** Version string for this snapshot (e.g. an ISO timestamp). */
  version: string;
}

export interface PublishResult {
  version: string;
  peopleLabels: number;
  dogLabels: number;
  /** Whether the previous fat DB was archived to db/backups/ before overwrite. */
  backedUp: boolean;
}

type Row = Record<string, unknown>;

/**
 * Publish a release from the fat ingestion DB:
 *   1. the fat DB itself (with embeddings) — the durable artifact a fresh
 *      machine pulls to rebuild without re-running the vision models
 *   2. labels.json (human labels pinned to detection anchors, so they survive
 *      re-clustering)
 *   3. a slim, embedding-free DB snapshot + a `latest` pointer (for serving)
 *
 * Media (images/thumbnails) is published separately via syncMediaToStorage.
 */
export async function publishToStorage(
  opts: PublishOptions,
): Promise<PublishResult> {
  const db = createDb(opts.dbPath);

  const allFaces = db.select().from(faces).all() as Row[];
  const allDogs = db.select().from(dogs).all() as Row[];
  const allPhotos = db.select().from(photos).all() as Row[];

  const hashByUuid = new Map<string, string>();
  for (const p of allPhotos) {
    if (p.contentHash) hashByUuid.set(p.uuid as string, p.contentHash as string);
  }
  const facesByPhoto = groupBy(allFaces, (f) => f.photoUuid as string);
  const dogsByPhoto = groupBy(allDogs, (d) => d.photoUuid as string);

  // 1. The fat DB — durable, embeddings intact. NOT vacuumed, so rsync only
  //    ships the deltas. Copied straight up (it's not being written concurrently
  //    here, same as the slim snapshot's copyFileSync below). Archive the
  //    previous one first so a bad publish never destroys the last good DB.
  let backedUp = false;
  if (await opts.storage.exists(KEYS.dbFat())) {
    await opts.storage.copy(KEYS.dbFat(), KEYS.dbFatBackup(opts.version));
    backedUp = true;
    // Retain only the newest BACKUPS_TO_KEEP archives. Keys sort chronologically
    // (the version is an ISO-ish timestamp), so newest-first then drop the tail.
    const backups = (await opts.storage.list('db/backups')).sort().reverse();
    for (const key of backups.slice(BACKUPS_TO_KEEP)) {
      await opts.storage.delete(key);
    }
  }
  await opts.storage.putFile(KEYS.dbFat(), opts.dbPath);

  // 2. labels.json — labeled or ignored clusters, pinned to anchor detections.
  const people = buildLabelEntries(
    db.select().from(faceClusters).all() as Row[],
    facesByPhoto,
    allFaces,
    hashByUuid,
    'personLabel',
  );
  const dogLabelEntries = buildLabelEntries(
    db.select().from(dogClusters).all() as Row[],
    dogsByPhoto,
    allDogs,
    hashByUuid,
    'dogLabel',
  );
  const labels: LabelsFile = { version: 1, people, dogs: dogLabelEntries };
  await opts.storage.put(KEYS.labels(), serializeLabels(labels));

  // 3. Slim, embedding-free DB snapshot + latest pointer (what serving pulls).
  const slimPath = buildSlimDb(opts.dbPath);
  try {
    await opts.storage.putFile(KEYS.dbVersion(opts.version), slimPath);
    await opts.storage.put(KEYS.dbLatest(), Buffer.from(opts.version));
  } finally {
    unlinkSync(slimPath);
  }

  return {
    version: opts.version,
    peopleLabels: people.length,
    dogLabels: dogLabelEntries.length,
    backedUp,
  };
}

function buildLabelEntries(
  clusters: Row[],
  detsByPhoto: Map<string, Row[]>,
  allDets: Row[],
  hashByUuid: Map<string, string>,
  labelCol: 'personLabel' | 'dogLabel',
): LabelEntry[] {
  const detsByCluster = groupBy(
    allDets.filter((d) => d.clusterId != null),
    (d) => d.clusterId as number,
  );
  const entries: LabelEntry[] = [];
  for (const cluster of clusters) {
    const label = (cluster[labelCol] as string | null) ?? null;
    const ignored = Boolean(cluster.ignored);
    if (label == null && !ignored) continue; // unlabeled, not ignored → skip

    const members = (detsByCluster.get(cluster.id as number) ?? [])
      .slice()
      .sort((a, b) => (b.detScore as number) - (a.detScore as number))
      .slice(0, ANCHORS_PER_LABEL);

    const anchors: Anchor[] = [];
    for (const m of members) {
      const hash = hashByUuid.get(m.photoUuid as string);
      if (!hash) continue;
      anchors.push({
        contentHash: hash,
        bbox: [
          m.bboxX as number,
          m.bboxY as number,
          m.bboxW as number,
          m.bboxH as number,
        ],
      });
    }
    if (anchors.length === 0) continue; // can't reattach without anchors
    entries.push({ label, ignored, anchors });
  }
  return entries;
}

/** Copy the DB and strip embeddings (the bulk), then VACUUM to reclaim space.
 * Embedding columns are NOT NULL, so they're emptied rather than dropped —
 * the serving schema stays identical, only the heavy bytes go. */
function buildSlimDb(dbPath: string): string {
  const slimPath = path.join(
    os.tmpdir(),
    `prod-${process.pid}-${dbPath.split('/').pop()}`,
  );
  copyFileSync(dbPath, slimPath);
  const sqlite = new Database(slimPath);
  try {
    sqlite.exec("UPDATE faces SET embedding = X''");
    sqlite.exec("UPDATE dogs SET embedding = X''");
    sqlite.exec('UPDATE photos SET tags_embedding = NULL');
    sqlite.exec('VACUUM');
  } finally {
    sqlite.close();
  }
  return slimPath;
}

function groupBy<T, K>(items: T[], key: (t: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k) ?? [];
    list.push(item);
    map.set(k, list);
  }
  return map;
}
