import path from 'node:path';
import { eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { createDb } from 'shared/db';
import { faceClusters, faces } from 'shared/db/schema';
import { loadConfig } from '@/config.js';
import { summary } from '@/progress.js';
import { settings } from '@/settings.js';

// Tunables (see faces.cluster in offline-processing.config.yaml). ArcFace
// embeddings are L2-normalized so cosine distance = 1 - dot. Same-person
// distances cluster around 0.1-0.4; different-people start around 0.7+.
// Conservative thresholds favor splits over false merges — the UI lets you
// merge two clusters of the same person, but unmerging a wrong-merge means
// re-labeling everything.
const {
  eps: DBSCAN_EPS,
  minPts: DBSCAN_MIN_PTS,
  stickyAssignDist: STICKY_ASSIGN_DIST,
} = settings.faces.cluster;

interface FaceRow {
  id: number;
  embedding: Float32Array;
  clusterId: number | null;
}

interface StickyCluster {
  id: number;
  centroid: Float32Array;
  label: string | null;
  ignored: boolean;
}

// Run a DB op in slices so we never blow the SQLite expression-tree depth (1000)
// or the variable-count limit (~32k). Order doesn't matter for these updates.
async function chunked<T>(
  items: T[],
  size: number,
  fn: (slice: T[]) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await fn(items.slice(i, i + size));
  }
}

function bufToFloat32(buf: Buffer): Float32Array {
  return new Float32Array(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  );
}

function cosineDistance(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return 1 - dot;
}

function meanNormalized(vecs: Float32Array[]): Float32Array {
  const dim = vecs[0].length;
  const out = new Float32Array(dim);
  for (const v of vecs) for (let i = 0; i < dim; i++) out[i] += v[i];
  for (let i = 0; i < dim; i++) out[i] /= vecs.length;
  let mag = 0;
  for (let i = 0; i < dim; i++) mag += out[i] * out[i];
  mag = Math.sqrt(mag);
  if (mag > 0) for (let i = 0; i < dim; i++) out[i] /= mag;
  return out;
}

function dbscan(points: Float32Array[], eps: number, minPts: number): number[] {
  const n = points.length;
  const labels = new Array<number>(n).fill(-2); // -2 unvisited, -1 noise, >=0 cluster id
  let next = 0;

  const regionQuery = (p: number): number[] => {
    const neighbors: number[] = [];
    for (let q = 0; q < n; q++) {
      if (cosineDistance(points[p], points[q]) <= eps) neighbors.push(q);
    }
    return neighbors;
  };

  for (let p = 0; p < n; p++) {
    if (labels[p] !== -2) continue;
    const seeds = regionQuery(p);
    if (seeds.length < minPts) {
      labels[p] = -1;
      continue;
    }
    const cid = next++;
    labels[p] = cid;
    while (seeds.length > 0) {
      const q = seeds.shift() as number;
      if (labels[q] === -1) labels[q] = cid; // border point
      if (labels[q] !== -2) continue;
      labels[q] = cid;
      const qN = regionQuery(q);
      if (qN.length >= minPts) seeds.push(...qN);
    }
  }
  return labels;
}

async function main() {
  const config = loadConfig();
  if (!config.DATABASE_URL) {
    console.error('DATABASE_URL must be set.');
    process.exit(1);
  }
  const db = createDb(path.resolve(config.DATABASE_URL));

  console.log('--- Cluster faces ---');

  const faceRows = await db
    .select({
      id: faces.id,
      embedding: faces.embedding,
      clusterId: faces.clusterId,
    })
    .from(faces);

  const faceData: FaceRow[] = faceRows
    .filter(
      (r): r is { id: number; embedding: Buffer; clusterId: number | null } =>
        Buffer.isBuffer(r.embedding),
    )
    .map((r) => ({
      id: r.id,
      embedding: bufToFloat32(r.embedding),
      clusterId: r.clusterId,
    }));

  console.log(`  Faces in DB:  ${faceData.length}`);
  if (faceData.length === 0) {
    console.log('Nothing to cluster.');
    process.exit(0);
  }

  // Existing clusters fall into two buckets:
  //   - sticky:  labeled or ignored — preserve, recompute centroid from members,
  //              new faces close to centroid get auto-assigned
  //   - transient: unlabeled & un-ignored — delete and re-form via DBSCAN
  const allClusters = await db
    .select({
      id: faceClusters.id,
      personLabel: faceClusters.personLabel,
      ignored: faceClusters.ignored,
    })
    .from(faceClusters);

  const sticky: StickyCluster[] = [];
  const transientIds: number[] = [];
  for (const c of allClusters) {
    if (c.personLabel || c.ignored) {
      const members = faceData.filter((f) => f.clusterId === c.id);
      if (members.length === 0) continue; // empty sticky cluster — skip but don't delete (user might still want to merge into it later? simpler: keep it)
      sticky.push({
        id: c.id,
        centroid: meanNormalized(members.map((m) => m.embedding)),
        label: c.personLabel,
        ignored: c.ignored,
      });
    } else {
      transientIds.push(c.id);
    }
  }
  console.log(
    `  Sticky:       ${sticky.length} (${sticky.filter((s) => s.label).length} labeled, ${sticky.filter((s) => s.ignored).length} ignored)`,
  );
  console.log(`  Transient:    ${transientIds.length} (will be recomputed)`);

  // Clear cluster_id from faces in transient clusters and from any unassigned faces
  // we want to re-evaluate. Simplest: clear ALL non-sticky cluster_id refs.
  const stickyIds = new Set(sticky.map((s) => s.id));
  for (const f of faceData) {
    if (f.clusterId !== null && !stickyIds.has(f.clusterId)) f.clusterId = null;
  }

  // Persist the clear in DB and remove transient cluster rows.
  if (transientIds.length > 0) {
    await chunked(transientIds, 500, (slice) =>
      db
        .update(faces)
        .set({ clusterId: null })
        .where(inArray(faces.clusterId, slice)),
    );
    await chunked(transientIds, 500, (slice) =>
      db.delete(faceClusters).where(inArray(faceClusters.id, slice)),
    );
  }

  // Assign faces to sticky clusters when close enough to a centroid.
  let assignedToSticky = 0;
  if (sticky.length > 0) {
    const updatesByCluster = new Map<number, number[]>();
    for (const f of faceData) {
      if (f.clusterId !== null) continue; // already assigned (kept from prior run)
      let bestId: number | null = null;
      let bestDist = STICKY_ASSIGN_DIST;
      for (const s of sticky) {
        const d = cosineDistance(f.embedding, s.centroid);
        if (d < bestDist) {
          bestDist = d;
          bestId = s.id;
        }
      }
      if (bestId !== null) {
        f.clusterId = bestId;
        const arr = updatesByCluster.get(bestId) ?? [];
        arr.push(f.id);
        updatesByCluster.set(bestId, arr);
      }
    }
    for (const [cid, faceIds] of updatesByCluster) {
      await chunked(faceIds, 500, (slice) =>
        db
          .update(faces)
          .set({ clusterId: cid })
          .where(inArray(faces.id, slice)),
      );
      assignedToSticky += faceIds.length;
    }
  }
  console.log(`  Auto-assigned to sticky: ${assignedToSticky}`);

  // DBSCAN over the still-unassigned faces.
  const unassigned = faceData.filter((f) => f.clusterId === null);
  console.log(
    `  Running DBSCAN on ${unassigned.length} remaining faces (eps=${DBSCAN_EPS}, minPts=${DBSCAN_MIN_PTS})...`,
  );
  const t0 = Date.now();
  const labels = dbscan(
    unassigned.map((f) => f.embedding),
    DBSCAN_EPS,
    DBSCAN_MIN_PTS,
  );
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  // Group by label, ignore noise.
  const newClusters = new Map<number, number[]>(); // label -> face ids
  for (let i = 0; i < unassigned.length; i++) {
    const lbl = labels[i];
    if (lbl < 0) continue;
    const arr = newClusters.get(lbl) ?? [];
    arr.push(unassigned[i].id);
    newClusters.set(lbl, arr);
  }
  const noiseCount = labels.filter((l) => l < 0).length;
  console.log(
    `  DBSCAN found ${newClusters.size} new clusters (${noiseCount} noise / singletons) in ${elapsed}s`,
  );

  // Insert a face_clusters row per new cluster, then assign cluster_id.
  for (const [, faceIds] of newClusters) {
    const inserted = await db
      .insert(faceClusters)
      .values({})
      .returning({ id: faceClusters.id });
    const newId = inserted[0].id;
    await chunked(faceIds, 500, (slice) =>
      db
        .update(faces)
        .set({ clusterId: newId })
        .where(inArray(faces.id, slice)),
    );
  }

  // Summary.
  const finalCounts = await db
    .select({
      total: sql<number>`count(*)`,
    })
    .from(faceClusters);
  const labeled = await db
    .select({ count: sql<number>`count(*)` })
    .from(faceClusters)
    .where(isNotNull(faceClusters.personLabel));
  const ignored = await db
    .select({ count: sql<number>`count(*)` })
    .from(faceClusters)
    .where(eq(faceClusters.ignored, true));
  const unassignedFaces = await db
    .select({ count: sql<number>`count(*)` })
    .from(faces)
    .where(isNull(faces.clusterId));

  console.log(
    `\n  Clusters: ${finalCounts[0].total} total (${labeled[0].count} labeled, ${ignored[0].count} ignored)`,
  );
  console.log(`  Singleton faces (no cluster): ${unassignedFaces[0].count}`);
  summary(
    `${finalCounts[0].total} clusters · ${labeled[0].count} named · ${unassignedFaces[0].count} singleton faces`,
  );

  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
