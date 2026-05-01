import path from 'node:path';
import { eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { createDb } from 'shared/db';
import { dogClusters, dogs } from 'shared/db/schema';
import { loadConfig } from '@/config.js';

// Dog (DINOv2) embeddings are noisier than ArcFace face embeddings. Same-dog
// distances are typically 0.15-0.4; different dogs cluster around 0.5+. Use
// tighter thresholds than faces to favor splits over false merges — merging
// the wrong two dogs is hard to undo without re-labeling.
const DBSCAN_EPS = 0.35;
const DBSCAN_MIN_PTS = 3;
const STICKY_ASSIGN_DIST = 0.35;

interface DogRow {
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

function dbscan(
  points: Float32Array[],
  eps: number,
  minPts: number,
): number[] {
  const n = points.length;
  const labels = new Array<number>(n).fill(-2);
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
      if (labels[q] === -1) labels[q] = cid;
      if (labels[q] !== -2) continue;
      labels[q] = cid;
      const qN = regionQuery(q);
      if (qN.length >= minPts) seeds.push(...qN);
    }
  }
  return labels;
}

async function chunked<T>(
  items: T[],
  size: number,
  fn: (slice: T[]) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await fn(items.slice(i, i + size));
  }
}

async function main() {
  const config = loadConfig('local');
  if (!config.DATABASE_URL) {
    console.error('DATABASE_URL must be set.');
    process.exit(1);
  }
  const db = createDb(path.resolve(config.DATABASE_URL));

  console.log('--- Cluster dogs ---');

  const dogRows = await db
    .select({
      id: dogs.id,
      embedding: dogs.embedding,
      clusterId: dogs.clusterId,
    })
    .from(dogs);

  const dogData: DogRow[] = dogRows
    .filter((r): r is { id: number; embedding: Buffer; clusterId: number | null } =>
      Buffer.isBuffer(r.embedding),
    )
    .map((r) => ({
      id: r.id,
      embedding: bufToFloat32(r.embedding),
      clusterId: r.clusterId,
    }));

  console.log(`  Dogs in DB:   ${dogData.length}`);
  if (dogData.length === 0) {
    console.log('Nothing to cluster.');
    process.exit(0);
  }

  const allClusters = await db
    .select({
      id: dogClusters.id,
      dogLabel: dogClusters.dogLabel,
      ignored: dogClusters.ignored,
    })
    .from(dogClusters);

  const sticky: StickyCluster[] = [];
  const transientIds: number[] = [];
  for (const c of allClusters) {
    if (c.dogLabel || c.ignored) {
      const members = dogData.filter((d) => d.clusterId === c.id);
      if (members.length === 0) continue;
      sticky.push({
        id: c.id,
        centroid: meanNormalized(members.map((m) => m.embedding)),
        label: c.dogLabel,
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

  const stickyIds = new Set(sticky.map((s) => s.id));
  for (const d of dogData) {
    if (d.clusterId !== null && !stickyIds.has(d.clusterId)) d.clusterId = null;
  }

  if (transientIds.length > 0) {
    await chunked(transientIds, 500, (slice) =>
      db.update(dogs).set({ clusterId: null }).where(inArray(dogs.clusterId, slice)),
    );
    await chunked(transientIds, 500, (slice) =>
      db.delete(dogClusters).where(inArray(dogClusters.id, slice)),
    );
  }

  let assignedToSticky = 0;
  if (sticky.length > 0) {
    const updatesByCluster = new Map<number, number[]>();
    for (const d of dogData) {
      if (d.clusterId !== null) continue;
      let bestId: number | null = null;
      let bestDist = STICKY_ASSIGN_DIST;
      for (const s of sticky) {
        const dist = cosineDistance(d.embedding, s.centroid);
        if (dist < bestDist) {
          bestDist = dist;
          bestId = s.id;
        }
      }
      if (bestId !== null) {
        d.clusterId = bestId;
        const arr = updatesByCluster.get(bestId) ?? [];
        arr.push(d.id);
        updatesByCluster.set(bestId, arr);
      }
    }
    for (const [cid, dogIds] of updatesByCluster) {
      await chunked(dogIds, 500, (slice) =>
        db.update(dogs).set({ clusterId: cid }).where(inArray(dogs.id, slice)),
      );
      assignedToSticky += dogIds.length;
    }
  }
  console.log(`  Auto-assigned to sticky: ${assignedToSticky}`);

  const unassigned = dogData.filter((d) => d.clusterId === null);
  console.log(
    `  Running DBSCAN on ${unassigned.length} remaining dogs (eps=${DBSCAN_EPS}, minPts=${DBSCAN_MIN_PTS})...`,
  );
  const t0 = Date.now();
  const labels = dbscan(
    unassigned.map((d) => d.embedding),
    DBSCAN_EPS,
    DBSCAN_MIN_PTS,
  );
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const newClusters = new Map<number, number[]>();
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

  for (const [, dogIds] of newClusters) {
    const inserted = await db
      .insert(dogClusters)
      .values({})
      .returning({ id: dogClusters.id });
    const newId = inserted[0].id;
    await chunked(dogIds, 500, (slice) =>
      db.update(dogs).set({ clusterId: newId }).where(inArray(dogs.id, slice)),
    );
  }

  const finalCounts = await db
    .select({ total: sql<number>`count(*)` })
    .from(dogClusters);
  const labeled = await db
    .select({ count: sql<number>`count(*)` })
    .from(dogClusters)
    .where(isNotNull(dogClusters.dogLabel));
  const ignored = await db
    .select({ count: sql<number>`count(*)` })
    .from(dogClusters)
    .where(eq(dogClusters.ignored, true));
  const unassignedDogs = await db
    .select({ count: sql<number>`count(*)` })
    .from(dogs)
    .where(isNull(dogs.clusterId));

  console.log(
    `\n  Clusters: ${finalCounts[0].total} total (${labeled[0].count} labeled, ${ignored[0].count} ignored)`,
  );
  console.log(`  Singleton dogs (no cluster): ${unassignedDogs[0].count}`);

  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
