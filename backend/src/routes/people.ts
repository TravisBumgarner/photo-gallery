import { desc, eq, isNotNull, sql } from 'drizzle-orm';
import { Router } from 'express';
import { createDb } from 'shared/db';
import { faceClusters, faces } from 'shared/db/schema';
import { config } from '../config.js';

const db = createDb(config.DATABASE_URL);

export const router = Router();

// GET /api/people/labels — distinct labels in use with face counts, for the
// People filter sidebar. If two clusters share a label (after labeling or
// merging in offline-ingestion), counts are summed.
//
// The serving app is read-only: face detection, clustering, and the labeling /
// merging of clusters all happen offline in `offline-ingestion` (its label-app),
// so this router only exposes the read used to filter the gallery.
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
