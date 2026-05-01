import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { Router } from 'express';
import { createDb } from 'shared/db';
import { dogClusters, dogs, photos } from 'shared/db/schema';
import { config } from '../config.js';

const db = createDb(config.DATABASE_URL);

export const router = Router();

const SAMPLE_DOGS_PER_CLUSTER = 9;

interface SampleDog {
  dogId: number;
  photoUuid: string;
  thumbnailPath: string;
  bboxX: number;
  bboxY: number;
  bboxW: number;
  bboxH: number;
  detScore: number;
}

interface ClusterRow {
  id: number;
  dogLabel: string | null;
  ignored: boolean;
  dogCount: number;
  sampleDogs: SampleDog[];
}

router.get('/dogs/clusters', async (req, res) => {
  try {
    const status = String(req.query.status ?? 'unlabeled');
    const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 500);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    const minDogCount = Math.max(
      Number(req.query.minDogCount ?? (status === 'unlabeled' ? 3 : 0)),
      0,
    );

    const whereParts = [] as ReturnType<typeof eq>[];
    if (status === 'labeled') {
      whereParts.push(isNotNull(dogClusters.dogLabel));
    } else if (status === 'ignored') {
      whereParts.push(eq(dogClusters.ignored, true));
    } else {
      whereParts.push(isNull(dogClusters.dogLabel));
      whereParts.push(eq(dogClusters.ignored, false));
    }

    const clusters = await db
      .select({
        id: dogClusters.id,
        dogLabel: dogClusters.dogLabel,
        ignored: dogClusters.ignored,
        dogCount: sql<number>`count(${dogs.id})`,
      })
      .from(dogClusters)
      .leftJoin(dogs, eq(dogs.clusterId, dogClusters.id))
      .where(and(...whereParts))
      .groupBy(dogClusters.id)
      .having(sql`count(${dogs.id}) >= ${minDogCount}`)
      .orderBy(desc(sql`count(${dogs.id})`), asc(dogClusters.id))
      .limit(limit)
      .offset(offset);

    if (clusters.length === 0) {
      res.json({ clusters: [], hasMore: false });
      return;
    }

    const clusterIds = clusters.map((c) => c.id);
    const sampleRows = (await db.all(sql`
      SELECT dog_id, photo_uuid, thumbnail_path, bbox_x, bbox_y, bbox_w, bbox_h, det_score, cluster_id
      FROM (
        SELECT
          ${dogs.id} AS dog_id,
          ${dogs.photoUuid} AS photo_uuid,
          ${photos.thumbnailPath} AS thumbnail_path,
          ${dogs.bboxX} AS bbox_x,
          ${dogs.bboxY} AS bbox_y,
          ${dogs.bboxW} AS bbox_w,
          ${dogs.bboxH} AS bbox_h,
          ${dogs.detScore} AS det_score,
          ${dogs.clusterId} AS cluster_id,
          ROW_NUMBER() OVER (PARTITION BY ${dogs.clusterId} ORDER BY ${dogs.detScore} DESC) AS rn
        FROM ${dogs}
        JOIN ${photos} ON ${photos.uuid} = ${dogs.photoUuid}
        WHERE ${dogs.clusterId} IN (${sql.join(
          clusterIds.map((id) => sql`${id}`),
          sql`, `,
        )})
      )
      WHERE rn <= ${SAMPLE_DOGS_PER_CLUSTER}
    `)) as Array<{
      dog_id: number;
      photo_uuid: string;
      thumbnail_path: string;
      bbox_x: number;
      bbox_y: number;
      bbox_w: number;
      bbox_h: number;
      det_score: number;
      cluster_id: number;
    }>;

    const samplesByCluster = new Map<number, SampleDog[]>();
    for (const r of sampleRows) {
      const arr = samplesByCluster.get(r.cluster_id) ?? [];
      arr.push({
        dogId: r.dog_id,
        photoUuid: r.photo_uuid,
        thumbnailPath: r.thumbnail_path,
        bboxX: r.bbox_x,
        bboxY: r.bbox_y,
        bboxW: r.bbox_w,
        bboxH: r.bbox_h,
        detScore: r.det_score,
      });
      samplesByCluster.set(r.cluster_id, arr);
    }

    const out: ClusterRow[] = clusters.map((c) => ({
      id: c.id,
      dogLabel: c.dogLabel,
      ignored: c.ignored,
      dogCount: c.dogCount,
      sampleDogs: samplesByCluster.get(c.id) ?? [],
    }));

    res.json({ clusters: out, hasMore: clusters.length === limit });
  } catch (err) {
    console.error('GET /dogs/clusters failed:', err);
    res.status(500).json({ error: 'Failed to fetch clusters' });
  }
});

router.patch('/dogs/clusters/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const { dogLabel, ignored } = req.body as {
      dogLabel?: string | null;
      ignored?: boolean;
    };
    const update: { dogLabel?: string | null; ignored?: boolean; updatedAt: Date } = {
      updatedAt: new Date(),
    };
    if (dogLabel !== undefined) {
      update.dogLabel =
        dogLabel === null || dogLabel === '' ? null : dogLabel.trim();
    }
    if (ignored !== undefined) update.ignored = ignored;

    await db.update(dogClusters).set(update).where(eq(dogClusters.id, id));
    res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /dogs/clusters/:id failed:', err);
    res.status(500).json({ error: 'Failed to update cluster' });
  }
});

router.post('/dogs/clusters/merge', async (req, res) => {
  try {
    const { sourceIds, targetId } = req.body as {
      sourceIds: number[];
      targetId: number;
    };
    if (
      !Array.isArray(sourceIds) ||
      sourceIds.length === 0 ||
      !Number.isInteger(targetId)
    ) {
      res.status(400).json({ error: 'sourceIds[] and targetId required' });
      return;
    }
    if (sourceIds.includes(targetId)) {
      res.status(400).json({ error: 'targetId must not be in sourceIds' });
      return;
    }
    await db
      .update(dogs)
      .set({ clusterId: targetId, updatedAt: new Date() })
      .where(inArray(dogs.clusterId, sourceIds));
    await db.delete(dogClusters).where(inArray(dogClusters.id, sourceIds));
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /dogs/clusters/merge failed:', err);
    res.status(500).json({ error: 'Failed to merge clusters' });
  }
});

router.get('/dogs/labels', async (_req, res) => {
  try {
    const rows = await db
      .select({
        dogLabel: dogClusters.dogLabel,
        dogCount: sql<number>`count(${dogs.id})`,
      })
      .from(dogClusters)
      .leftJoin(dogs, eq(dogs.clusterId, dogClusters.id))
      .where(isNotNull(dogClusters.dogLabel))
      .groupBy(dogClusters.dogLabel)
      .orderBy(desc(sql`count(${dogs.id})`));
    res.json({ labels: rows });
  } catch (err) {
    console.error('GET /dogs/labels failed:', err);
    res.status(500).json({ error: 'Failed to fetch labels' });
  }
});
