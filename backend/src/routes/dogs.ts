import { desc, eq, isNotNull, sql } from 'drizzle-orm';
import { Router } from 'express';
import { createDb } from 'shared/db';
import { dogClusters, dogs } from 'shared/db/schema';
import { config } from '../config.js';

const db = createDb(config.DATABASE_URL);

export const router = Router();

// GET /api/dogs/labels — distinct labels in use with dog counts, for the
// Dogs filter sidebar. If two clusters share a label (after labeling or
// merging in offline-ingestion), counts are summed.
//
// The serving app is read-only: dog detection, clustering, and the labeling /
// merging of clusters all happen offline in `offline-ingestion` (its label-app),
// so this router only exposes the read used to filter the gallery.
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
