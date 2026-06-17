import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  sql,
} from 'drizzle-orm';
import type { AnySQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import express from 'express';
import { createDb } from 'shared/db';
import {
  dogClusters,
  dogs,
  faceClusters,
  faces,
  photos,
} from 'shared/db/schema';
import { loadConfig, thumbnailsDir } from '@/config.js';
import { settings } from '@/settings.js';

// Standalone cluster-labeling app. This replaces the old frontend PeoplePage /
// DogsPage. It talks to the same sqlite.db directly via shared/db — no dependency
// on the main backend or frontend. People (faces / personLabel) and dogs
// (dogLabel) are near-identical, so both are driven from one KINDS table.

const config = loadConfig();
if (!config.DATABASE_URL) {
  console.error('DATABASE_URL must be set in .cli-cache (path to sqlite).');
  process.exit(1);
}
const dbPath = path.resolve(config.DATABASE_URL);
const db = createDb(dbPath);

interface Kind {
  clusters: SQLiteTable;
  items: SQLiteTable;
  clusterId: AnySQLiteColumn;
  clusterPk: AnySQLiteColumn;
  labelColumn: AnySQLiteColumn;
  labelKey: 'personLabel' | 'dogLabel';
  ignoredColumn: AnySQLiteColumn;
  itemId: AnySQLiteColumn;
  itemClusterId: AnySQLiteColumn;
  photoUuid: AnySQLiteColumn;
  bboxX: AnySQLiteColumn;
  bboxY: AnySQLiteColumn;
  bboxW: AnySQLiteColumn;
  bboxH: AnySQLiteColumn;
  detScore: AnySQLiteColumn;
  updatedAt: AnySQLiteColumn;
  minUnlabeled: number;
}

const KINDS: Record<string, Kind> = {
  people: {
    clusters: faceClusters,
    items: faces,
    clusterId: faces.clusterId,
    clusterPk: faceClusters.id,
    labelColumn: faceClusters.personLabel,
    labelKey: 'personLabel',
    ignoredColumn: faceClusters.ignored,
    itemId: faces.id,
    itemClusterId: faces.clusterId,
    photoUuid: faces.photoUuid,
    bboxX: faces.bboxX,
    bboxY: faces.bboxY,
    bboxW: faces.bboxW,
    bboxH: faces.bboxH,
    detScore: faces.detScore,
    updatedAt: faceClusters.updatedAt,
    minUnlabeled: 5,
  },
  dogs: {
    clusters: dogClusters,
    items: dogs,
    clusterId: dogs.clusterId,
    clusterPk: dogClusters.id,
    labelColumn: dogClusters.dogLabel,
    labelKey: 'dogLabel',
    ignoredColumn: dogClusters.ignored,
    itemId: dogs.id,
    itemClusterId: dogs.clusterId,
    photoUuid: dogs.photoUuid,
    bboxX: dogs.bboxX,
    bboxY: dogs.bboxY,
    bboxW: dogs.bboxW,
    bboxH: dogs.bboxH,
    detScore: dogs.detScore,
    updatedAt: dogClusters.updatedAt,
    minUnlabeled: 3,
  },
};

const SAMPLES_PER_CLUSTER = settings.labelApp.sampleFacesPerCluster;

const app = express();
app.use(express.json());

// Serve the photo thumbnails (photos.thumbnailPath looks like
// "thumbnails/thumb_<uuid>.jpg", so static-mount the destination root).
app.use(express.static(path.dirname(thumbnailsDir(config))));

function getKind(req: express.Request, res: express.Response): Kind | null {
  const kind = KINDS[req.params.kind];
  if (!kind) {
    res.status(404).json({ error: `unknown kind '${req.params.kind}'` });
    return null;
  }
  return kind;
}

// GET /api/:kind/clusters?status=unlabeled|labeled|ignored&limit=&offset=
app.get('/api/:kind/clusters', async (req, res) => {
  const k = getKind(req, res);
  if (!k) return;
  try {
    const status = String(req.query.status ?? 'unlabeled');
    const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 500);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    const minCount = Math.max(
      Number(
        req.query.minCount ??
          (status === 'unlabeled' ? k.minUnlabeled : status === 'all' ? 1 : 0),
      ),
      0,
    );

    const whereParts = [] as ReturnType<typeof eq>[];
    if (status === 'labeled') {
      whereParts.push(isNotNull(k.labelColumn));
    } else if (status === 'ignored') {
      whereParts.push(eq(k.ignoredColumn, true));
    } else if (status === 'all') {
      // Every real group (labeled + unlabeled), minus ignored junk. Drives the
      // Merge tab, where you consolidate groups that are the same subject.
      whereParts.push(eq(k.ignoredColumn, false));
    } else {
      whereParts.push(isNull(k.labelColumn));
      whereParts.push(eq(k.ignoredColumn, false));
    }

    const clusters = await db
      .select({
        id: k.clusterPk,
        label: k.labelColumn,
        ignored: k.ignoredColumn,
        count: sql<number>`count(${k.itemId})`,
      })
      .from(k.clusters)
      .leftJoin(k.items, eq(k.itemClusterId, k.clusterPk))
      .where(and(...whereParts))
      .groupBy(k.clusterPk)
      .having(sql`count(${k.itemId}) >= ${minCount}`)
      .orderBy(desc(sql`count(${k.itemId})`), asc(k.clusterPk))
      .limit(limit)
      .offset(offset);

    if (clusters.length === 0) {
      res.json({ clusters: [], hasMore: false });
      return;
    }

    const clusterIds = clusters.map((c) => c.id as number);
    const sampleRows = (await db.all(sql`
      SELECT item_id, photo_uuid, thumbnail_path, bbox_x, bbox_y, bbox_w, bbox_h, det_score, cluster_id
      FROM (
        SELECT
          ${k.itemId} AS item_id,
          ${k.photoUuid} AS photo_uuid,
          ${photos.thumbnailPath} AS thumbnail_path,
          ${k.bboxX} AS bbox_x,
          ${k.bboxY} AS bbox_y,
          ${k.bboxW} AS bbox_w,
          ${k.bboxH} AS bbox_h,
          ${k.detScore} AS det_score,
          ${k.itemClusterId} AS cluster_id,
          ROW_NUMBER() OVER (PARTITION BY ${k.itemClusterId} ORDER BY ${k.detScore} DESC) AS rn
        FROM ${k.items}
        JOIN ${photos} ON ${photos.uuid} = ${k.photoUuid}
        WHERE ${k.itemClusterId} IN (${sql.join(
          clusterIds.map((id) => sql`${id}`),
          sql`, `,
        )})
      )
      WHERE rn <= ${SAMPLES_PER_CLUSTER}
    `)) as Array<{
      item_id: number;
      photo_uuid: string;
      thumbnail_path: string;
      bbox_x: number;
      bbox_y: number;
      bbox_w: number;
      bbox_h: number;
      det_score: number;
      cluster_id: number;
    }>;

    const samplesByCluster = new Map<number, unknown[]>();
    for (const r of sampleRows) {
      const arr = samplesByCluster.get(r.cluster_id) ?? [];
      arr.push({
        itemId: r.item_id,
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

    res.json({
      clusters: clusters.map((c) => ({
        id: c.id,
        label: c.label,
        ignored: c.ignored,
        count: c.count,
        samples: samplesByCluster.get(c.id as number) ?? [],
      })),
      hasMore: clusters.length === limit,
    });
  } catch (err) {
    console.error(`GET /api/${req.params.kind}/clusters failed:`, err);
    res.status(500).json({ error: 'Failed to fetch clusters' });
  }
});

// PATCH /api/:kind/clusters/:id  body: { label?: string|null, ignored?: boolean }
app.patch('/api/:kind/clusters/:id', async (req, res) => {
  const k = getKind(req, res);
  if (!k) return;
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const { label, ignored } = req.body as {
      label?: string | null;
      ignored?: boolean;
    };
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (label !== undefined) {
      update[k.labelKey] = label === null || label === '' ? null : label.trim();
    }
    if (ignored !== undefined) update.ignored = ignored;

    await db.update(k.clusters).set(update).where(eq(k.clusterPk, id));
    res.json({ ok: true });
  } catch (err) {
    console.error(`PATCH /api/${req.params.kind}/clusters/:id failed:`, err);
    res.status(500).json({ error: 'Failed to update cluster' });
  }
});

// POST /api/:kind/clusters/merge  body: { sourceIds: number[], targetId: number }
app.post('/api/:kind/clusters/merge', async (req, res) => {
  const k = getKind(req, res);
  if (!k) return;
  try {
    const { sourceIds, targetId } = req.body as {
      sourceIds: number[];
      targetId: number;
    };
    if (
      !Array.isArray(sourceIds) ||
      sourceIds.length === 0 ||
      !Number.isInteger(targetId) ||
      sourceIds.includes(targetId)
    ) {
      res
        .status(400)
        .json({ error: 'sourceIds[] and a distinct targetId required' });
      return;
    }
    await db
      .update(k.items)
      .set({ clusterId: targetId, updatedAt: new Date() })
      .where(inArray(k.itemClusterId, sourceIds));
    await db.delete(k.clusters).where(inArray(k.clusterPk, sourceIds));
    res.json({ ok: true });
  } catch (err) {
    console.error(`POST /api/${req.params.kind}/clusters/merge failed:`, err);
    res.status(500).json({ error: 'Failed to merge clusters' });
  }
});

// GET /api/:kind/labels — distinct labels with counts.
app.get('/api/:kind/labels', async (req, res) => {
  const k = getKind(req, res);
  if (!k) return;
  try {
    const rows = await db
      .select({
        label: k.labelColumn,
        count: sql<number>`count(${k.itemId})`,
      })
      .from(k.clusters)
      .leftJoin(k.items, eq(k.itemClusterId, k.clusterPk))
      .where(isNotNull(k.labelColumn))
      .groupBy(k.labelColumn)
      .orderBy(desc(sql`count(${k.itemId})`));
    res.json({ labels: rows });
  } catch (err) {
    console.error(`GET /api/${req.params.kind}/labels failed:`, err);
    res.status(500).json({ error: 'Failed to fetch labels' });
  }
});

// GET /api/:kind/counts — per-tab totals for the header + section badges. Each
// count mirrors the corresponding list query so the badge matches what you see.
app.get('/api/:kind/counts', async (req, res) => {
  const k = getKind(req, res);
  if (!k) return;
  try {
    const countClusters = async (cond: ReturnType<typeof eq>) =>
      Number(
        (
          await db
            .select({ n: sql<number>`count(*)` })
            .from(k.clusters)
            .where(cond)
        )[0]?.n ?? 0,
      );

    // Unlabeled = groups not named, not ignored, meeting the display threshold
    // (item count >= minUnlabeled) — same filter the Unlabeled list uses.
    const unlabeledGroups = await db
      .select({ id: k.clusterPk })
      .from(k.clusters)
      .leftJoin(k.items, eq(k.itemClusterId, k.clusterPk))
      .where(and(isNull(k.labelColumn), eq(k.ignoredColumn, false)))
      .groupBy(k.clusterPk)
      .having(sql`count(${k.itemId}) >= ${k.minUnlabeled}`);

    const ungrouped = Number(
      (
        await db
          .select({ n: sql<number>`count(*)` })
          .from(k.items)
          .where(isNull(k.itemClusterId))
      )[0]?.n ?? 0,
    );

    const [labeled, ignored, merge] = await Promise.all([
      countClusters(isNotNull(k.labelColumn)),
      countClusters(eq(k.ignoredColumn, true)),
      countClusters(eq(k.ignoredColumn, false)),
    ]);

    res.json({
      unlabeled: unlabeledGroups.length,
      ungrouped,
      merge,
      labeled,
      ignored,
    });
  } catch (err) {
    console.error(`GET /api/${req.params.kind}/counts failed:`, err);
    res.status(500).json({ error: 'Failed to fetch counts' });
  }
});

// GET /api/:kind/ungrouped?limit=&offset= — individual detections that never
// landed in a cluster (clusterId IS NULL): the singletons/noise that didn't meet
// minPts. Returns crops so the "Ungrouped" tab can show the actual photos.
app.get('/api/:kind/ungrouped', async (req, res) => {
  const k = getKind(req, res);
  if (!k) return;
  try {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 500);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);

    const rows = await db
      .select({
        itemId: k.itemId,
        photoUuid: k.photoUuid,
        thumbnailPath: photos.thumbnailPath,
        bboxX: k.bboxX,
        bboxY: k.bboxY,
        bboxW: k.bboxW,
        bboxH: k.bboxH,
        detScore: k.detScore,
      })
      .from(k.items)
      .innerJoin(photos, eq(photos.uuid, k.photoUuid))
      .where(isNull(k.itemClusterId))
      .orderBy(desc(k.detScore))
      .limit(limit + 1) // fetch one extra to detect hasMore
      .offset(offset);

    const hasMore = rows.length > limit;
    res.json({ items: rows.slice(0, limit), hasMore });
  } catch (err) {
    console.error(`GET /api/${req.params.kind}/ungrouped failed:`, err);
    res.status(500).json({ error: 'Failed to fetch ungrouped items' });
  }
});

const here = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(here, 'public')));

const port = settings.labelApp.port;
app.listen(port, () => {
  console.log(`\n  Label app:    http://localhost:${port}`);
  console.log(`  Database:     ${dbPath}`);
  console.log(
    '  Tag people and dogs, then re-run clustering as new photos arrive.\n',
  );
});
