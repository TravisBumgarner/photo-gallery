import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { createDb } from './db/index.js';
import { dogClusters, dogs, faceClusters, faces, photos } from './db/schema.js';
import {
  type ClusterMembers,
  parseLabels,
  reapplyLabels,
} from './labels.js';
import { decodeEmbedding, type Detection, parseSidecar } from './sidecar.js';
import { KEYS, type StorageBackend } from './storage/index.js';

/**
 * Repopulate a freshly-ingested DB from sidecars so the expensive compute
 * (tags, embeddings, detections) is restored from storage instead of re-run.
 * Operates per-photo by content hash and only fills gaps — so it's safe to run
 * before tag/detect, which then skip the rows it restored (their WHERE-NULL
 * guards). Clustering runs afterward on the restored embeddings.
 */
export interface RestoreResult {
  photosTagged: number;
  facesRestored: number;
  dogsRestored: number;
  sidecarsMissing: number;
}

export async function restoreFromSidecars(
  dbPath: string,
  storage: StorageBackend,
): Promise<RestoreResult> {
  const db = createDb(dbPath);
  const now = new Date();
  const result: RestoreResult = {
    photosTagged: 0,
    facesRestored: 0,
    dogsRestored: 0,
    sidecarsMissing: 0,
  };

  const rows = db
    .select({
      uuid: photos.uuid,
      contentHash: photos.contentHash,
      tags: photos.tags,
      facesProcessedAt: photos.facesProcessedAt,
      dogsProcessedAt: photos.dogsProcessedAt,
    })
    .from(photos)
    .where(isNotNull(photos.contentHash))
    .all();

  for (const row of rows) {
    const hash = row.contentHash as string;
    const needsTags = row.tags == null;
    const needsFaces = row.facesProcessedAt == null;
    const needsDogs = row.dogsProcessedAt == null;
    if (!needsTags && !needsFaces && !needsDogs) continue;

    if (!(await storage.exists(KEYS.sidecar(hash)))) {
      result.sidecarsMissing++;
      continue;
    }
    const sidecar = parseSidecar(await storage.get(KEYS.sidecar(hash)));

    if (needsTags && sidecar.tags != null) {
      db.update(photos)
        .set({
          tags: sidecar.tags,
          tagsEmbedding: decodeEmbedding(sidecar.tagsEmbedding) ?? undefined,
          updatedAt: now,
        })
        .where(eq(photos.uuid, row.uuid))
        .run();
      result.photosTagged++;
    }

    if (needsFaces) {
      insertDetections(db, faces, row.uuid, sidecar.faces);
      db.update(photos)
        .set({ facesProcessedAt: now })
        .where(eq(photos.uuid, row.uuid))
        .run();
      result.facesRestored += sidecar.faces.length;
    }

    if (needsDogs) {
      insertDetections(db, dogs, row.uuid, sidecar.dogs);
      db.update(photos)
        .set({ dogsProcessedAt: now })
        .where(eq(photos.uuid, row.uuid))
        .run();
      result.dogsRestored += sidecar.dogs.length;
    }
  }

  return result;
}

function insertDetections(
  db: ReturnType<typeof createDb>,
  table: typeof faces | typeof dogs,
  photoUuid: string,
  detections: Detection[],
) {
  if (detections.length === 0) return;
  db.insert(table)
    .values(
      detections.map((d) => ({
        photoUuid,
        bboxX: d.bboxX,
        bboxY: d.bboxY,
        bboxW: d.bboxW,
        bboxH: d.bboxH,
        detScore: d.detScore,
        embedding: decodeEmbedding(d.embedding) ?? Buffer.alloc(0),
        clusterId: null,
      })),
    )
    .run();
}

/**
 * Reattach durable labels (labels.json) to the current clusters after
 * (re-)clustering. Labels are pinned to detection anchors, so they survive the
 * cluster IDs churning. No-op if there is no labels.json yet.
 */
export interface ApplyLabelsResult {
  peopleApplied: number;
  dogsApplied: number;
}

export async function applyLabels(
  dbPath: string,
  storage: StorageBackend,
): Promise<ApplyLabelsResult> {
  const db = createDb(dbPath);
  if (!(await storage.exists(KEYS.labels()))) {
    return { peopleApplied: 0, dogsApplied: 0 };
  }
  const labels = parseLabels(await storage.get(KEYS.labels()));

  const peopleApplied = applyKind(
    db,
    faces,
    faceClusters,
    'personLabel',
    labels.people,
  );
  const dogsApplied = applyKind(db, dogs, dogClusters, 'dogLabel', labels.dogs);
  return { peopleApplied, dogsApplied };
}

function applyKind(
  db: ReturnType<typeof createDb>,
  detTable: typeof faces | typeof dogs,
  clusterTable: typeof faceClusters | typeof dogClusters,
  labelCol: 'personLabel' | 'dogLabel',
  entries: import('./labels.js').LabelEntry[],
): number {
  // Current clusters and their member detections, anchored by content hash.
  const memberRows = db
    .select({
      clusterId: detTable.clusterId,
      contentHash: photos.contentHash,
      bboxX: detTable.bboxX,
      bboxY: detTable.bboxY,
      bboxW: detTable.bboxW,
      bboxH: detTable.bboxH,
    })
    .from(detTable)
    .innerJoin(photos, eq(detTable.photoUuid, photos.uuid))
    .where(and(isNotNull(detTable.clusterId), isNotNull(photos.contentHash)))
    .all();

  const byCluster = new Map<number, ClusterMembers>();
  for (const m of memberRows) {
    const id = m.clusterId as number;
    const entry = byCluster.get(id) ?? { clusterId: id, members: [] };
    entry.members.push({
      contentHash: m.contentHash as string,
      bbox: [m.bboxX, m.bboxY, m.bboxW, m.bboxH],
    });
    byCluster.set(id, entry);
  }

  const reassignments = reapplyLabels(entries, [...byCluster.values()]);
  for (const r of reassignments) {
    db.update(clusterTable)
      .set({ [labelCol]: r.label, ignored: r.ignored, updatedAt: new Date() })
      .where(eq(clusterTable.id, r.clusterId))
      .run();
  }
  return reassignments.length;
}
