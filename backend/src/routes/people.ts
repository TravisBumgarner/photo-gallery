import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { Router } from 'express';
import { createDb } from 'shared/db';
import { faceClusters, faces, photos } from 'shared/db/schema';
import { config } from '../config.js';

const db = createDb(config.DATABASE_URL);

export const router = Router();

const SAMPLE_FACES_PER_CLUSTER = 9;

interface SampleFace {
  faceId: number;
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
  personLabel: string | null;
  ignored: boolean;
  faceCount: number;
  sampleFaces: SampleFace[];
}

// GET /api/people/clusters?status=labeled|unlabeled|ignored&limit=50&offset=0&minFaceCount=5
// Returns clusters sorted by face count desc, with up to 9 sample faces each.
// Defaults: limit=50, offset=0. minFaceCount defaults to 5 for "unlabeled" (filters
// out tiny noise clusters) and 0 for labeled/ignored (so user-curated clusters of
// any size always show up).
router.get('/people/clusters', async (req, res) => {
  try {
    const status = String(req.query.status ?? 'unlabeled');
    const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 500);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    const minFaceCount = Math.max(
      Number(
        req.query.minFaceCount ?? (status === 'unlabeled' ? 5 : 0),
      ),
      0,
    );

    const whereParts = [] as ReturnType<typeof eq>[];
    if (status === 'labeled') {
      whereParts.push(isNotNull(faceClusters.personLabel));
    } else if (status === 'ignored') {
      whereParts.push(eq(faceClusters.ignored, true));
    } else {
      // unlabeled = not labeled AND not ignored
      whereParts.push(isNull(faceClusters.personLabel));
      whereParts.push(eq(faceClusters.ignored, false));
    }

    // Aggregate face counts per cluster, then HAVING + LIMIT/OFFSET so we don't
    // ship hundreds of tiny clusters per page load.
    const clusters = await db
      .select({
        id: faceClusters.id,
        personLabel: faceClusters.personLabel,
        ignored: faceClusters.ignored,
        faceCount: sql<number>`count(${faces.id})`,
      })
      .from(faceClusters)
      .leftJoin(faces, eq(faces.clusterId, faceClusters.id))
      .where(and(...whereParts))
      .groupBy(faceClusters.id)
      .having(sql`count(${faces.id}) >= ${minFaceCount}`)
      .orderBy(desc(sql`count(${faces.id})`), asc(faceClusters.id))
      .limit(limit)
      .offset(offset);

    if (clusters.length === 0) {
      res.json({ clusters: [], hasMore: false });
      return;
    }

    // Pull top-N sample faces per cluster via a single windowed query.
    const clusterIds = clusters.map((c) => c.id);
    const sampleRows = (await db.all(sql`
      SELECT face_id, photo_uuid, thumbnail_path, bbox_x, bbox_y, bbox_w, bbox_h, det_score, cluster_id
      FROM (
        SELECT
          ${faces.id} AS face_id,
          ${faces.photoUuid} AS photo_uuid,
          ${photos.thumbnailPath} AS thumbnail_path,
          ${faces.bboxX} AS bbox_x,
          ${faces.bboxY} AS bbox_y,
          ${faces.bboxW} AS bbox_w,
          ${faces.bboxH} AS bbox_h,
          ${faces.detScore} AS det_score,
          ${faces.clusterId} AS cluster_id,
          ROW_NUMBER() OVER (PARTITION BY ${faces.clusterId} ORDER BY ${faces.detScore} DESC) AS rn
        FROM ${faces}
        JOIN ${photos} ON ${photos.uuid} = ${faces.photoUuid}
        WHERE ${faces.clusterId} IN (${sql.join(
          clusterIds.map((id) => sql`${id}`),
          sql`, `,
        )})
      )
      WHERE rn <= ${SAMPLE_FACES_PER_CLUSTER}
    `)) as Array<{
      face_id: number;
      photo_uuid: string;
      thumbnail_path: string;
      bbox_x: number;
      bbox_y: number;
      bbox_w: number;
      bbox_h: number;
      det_score: number;
      cluster_id: number;
    }>;

    const samplesByCluster = new Map<number, SampleFace[]>();
    for (const r of sampleRows) {
      const arr = samplesByCluster.get(r.cluster_id) ?? [];
      arr.push({
        faceId: r.face_id,
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
      personLabel: c.personLabel,
      ignored: c.ignored,
      faceCount: c.faceCount,
      sampleFaces: samplesByCluster.get(c.id) ?? [],
    }));

    // hasMore: page is full → there might be more behind it. Cheaper than a
    // separate COUNT(*).
    res.json({ clusters: out, hasMore: clusters.length === limit });
  } catch (err) {
    console.error('GET /people/clusters failed:', err);
    res.status(500).json({ error: 'Failed to fetch clusters' });
  }
});

// PATCH /api/people/clusters/:id  body: { personLabel?: string|null, ignored?: boolean }
router.patch('/people/clusters/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const { personLabel, ignored } = req.body as {
      personLabel?: string | null;
      ignored?: boolean;
    };
    const update: { personLabel?: string | null; ignored?: boolean; updatedAt: Date } = {
      updatedAt: new Date(),
    };
    if (personLabel !== undefined) {
      update.personLabel =
        personLabel === null || personLabel === '' ? null : personLabel.trim();
    }
    if (ignored !== undefined) update.ignored = ignored;

    await db.update(faceClusters).set(update).where(eq(faceClusters.id, id));
    res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /people/clusters/:id failed:', err);
    res.status(500).json({ error: 'Failed to update cluster' });
  }
});

// POST /api/people/clusters/merge  body: { sourceIds: number[], targetId: number }
// Reassigns all faces from sourceIds to targetId, then deletes the source rows.
router.post('/people/clusters/merge', async (req, res) => {
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
      .update(faces)
      .set({ clusterId: targetId, updatedAt: new Date() })
      .where(inArray(faces.clusterId, sourceIds));
    await db.delete(faceClusters).where(inArray(faceClusters.id, sourceIds));
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /people/clusters/merge failed:', err);
    res.status(500).json({ error: 'Failed to merge clusters' });
  }
});

// GET /api/people/labels — distinct labels in use with face counts, for the
// People filter sidebar. If two clusters share a label (after manual labeling
// or merging), counts are summed.
router.get('/people/labels', async (_req, res) => {
  try {
    const rows = await db
      .select({
        personLabel: faceClusters.personLabel,
        faceCount: sql<number>`count(${faces.id})`,
      })
      .from(faceClusters)
      .leftJoin(faces, eq(faces.clusterId, faceClusters.id))
      .where(isNotNull(faceClusters.personLabel))
      .groupBy(faceClusters.personLabel)
      .orderBy(desc(sql`count(${faces.id})`));
    res.json({ labels: rows });
  } catch (err) {
    console.error('GET /people/labels failed:', err);
    res.status(500).json({ error: 'Failed to fetch labels' });
  }
});
