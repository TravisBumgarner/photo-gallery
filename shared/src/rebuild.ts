import { and, eq, isNotNull } from 'drizzle-orm';
import { createDb } from './db/index.js';
import { dogClusters, dogs, faceClusters, faces, photos } from './db/schema.js';
import {
  type ClusterMembers,
  parseLabels,
  reapplyLabels,
} from './labels.js';
import { KEYS, type StorageBackend } from './storage/index.js';

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
