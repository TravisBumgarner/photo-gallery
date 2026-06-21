import { copyFileSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { bumpGeneration, readGeneration } from './db/generation.js';
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
  /** The fat DB's generation after this publish (monotonic, bumped each run). */
  generation: number;
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
  // Fail before any upload if the source DB is corrupt or half-written.
  assertIntegrity(opts.dbPath);

  // Generation guard: never overwrite a bucket fat DB that's newer than ours.
  // (A machine that restored an old backup, or a second writer, would otherwise
  // silently clobber newer published work.) Bump only after the check passes so
  // the new fat + slim both carry the advanced generation.
  const localGen = readGeneration(opts.dbPath);
  if (await opts.storage.exists(KEYS.dbFatGeneration())) {
    const remoteGen = Number(
      (await opts.storage.get(KEYS.dbFatGeneration())).toString().trim(),
    );
    if (Number.isFinite(remoteGen) && remoteGen > localGen) {
      throw new Error(
        `Refusing to publish: bucket fat DB is newer (generation ${remoteGen}) ` +
          `than local (generation ${localGen}). Restore the bucket DB first.`,
      );
    }
  }
  const generation = bumpGeneration(opts.dbPath);

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

  // labels.json — labeled or ignored clusters, pinned to anchor detections.
  // Pure read; built before any upload so the destructive steps come last.
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

  // 1. Slim, embedding-free snapshot. Build it and verify its row counts match
  //    the fat DB *before* publishing anything — a truncated copy would yield a
  //    valid-looking but wrong snapshot, and flipping `latest` to it would feed
  //    the server broken data silently.
  const slimPath = buildSlimDb(opts.dbPath);
  try {
    verifySlim(slimPath, {
      photos: allPhotos.length,
      faces: allFaces.length,
      dogs: allDogs.length,
    });

    // 2. Non-destructive uploads: labels, then the immutable slim snapshot.
    await opts.storage.put(KEYS.labels(), serializeLabels(labels));
    await opts.storage.putFile(KEYS.dbVersion(opts.version), slimPath);

    // 3. Cutover — flip `latest` only once the new slim is uploaded + verified.
    await opts.storage.put(KEYS.dbLatest(), Buffer.from(opts.version));
  } finally {
    unlinkSync(slimPath);
  }

  // 4. Last, the destructive step: archive the previous fat DB, then overwrite
  //    it. Done after the cutover so a failure here leaves serving on the new
  //    slim and the bucket fat one publish behind (recoverable) — never
  //    corrupted. NOT vacuumed, so rsync only ships the deltas.
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
  // Advance the bucket's generation only after the fat DB it describes is up,
  // so the mirror never claims a generation the bucket fat doesn't have.
  await opts.storage.put(KEYS.dbFatGeneration(), Buffer.from(String(generation)));

  return {
    version: opts.version,
    generation,
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

/** Abort the publish if the source DB is corrupt or truncated. `quick_check`
 * is the cheaper sibling of `integrity_check` — enough to catch a half-written
 * or torn file before we derive a snapshot from it. */
function assertIntegrity(dbPath: string): void {
  const sqlite = new Database(dbPath, { readonly: true });
  try {
    const result = sqlite.pragma('quick_check', { simple: true });
    if (result !== 'ok') {
      throw new Error(
        `Refusing to publish: fat DB failed integrity check (${dbPath}): ${result}`,
      );
    }
  } finally {
    sqlite.close();
  }
}

/** Abort before cutover unless the slim snapshot's row counts match the fat DB
 * exactly — slim is a byte copy with only the embedding columns emptied, so any
 * mismatch (or a zero-photo library) means the copy is bad. */
function verifySlim(
  slimPath: string,
  expected: { photos: number; faces: number; dogs: number },
): void {
  const sqlite = new Database(slimPath, { readonly: true });
  try {
    const count = (table: string): number =>
      (sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number })
        .n;
    const got = {
      photos: count('photos'),
      faces: count('faces'),
      dogs: count('dogs'),
    };
    for (const key of ['photos', 'faces', 'dogs'] as const) {
      if (got[key] !== expected[key]) {
        throw new Error(
          `Refusing to publish: slim DB ${key} count ${got[key]} != fat ${expected[key]}.`,
        );
      }
    }
    if (got.photos === 0) {
      throw new Error('Refusing to publish: slim DB has zero photos.');
    }
  } finally {
    sqlite.close();
  }
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
