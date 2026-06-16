import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dogs, faceClusters, faces, photos } from './db/schema.js';
import { publishToStorage } from './publish.js';
import { applyLabels, restoreFromSidecars } from './rebuild.js';
import { createStorage } from './storage/index.js';

const MIGRATIONS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../backend/drizzle',
);
const f32 = (...xs: number[]) => Buffer.from(new Float32Array(xs).buffer);

function newDb(dbPath: string) {
  const sqlite = new Database(dbPath);
  migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS });
  return sqlite;
}

describe('rebuild from sidecars', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rebuild-test-'));
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('restores compute + reattaches labels after a wipe', async () => {
    const storeDir = path.join(tmp, 'bucket');
    const storage = await createStorage(`file://${storeDir}`);

    // --- original ingestion DB: tagged photo + a labeled face cluster ---
    const origPath = path.join(tmp, 'orig.db');
    {
      const sqlite = newDb(origPath);
      const db = drizzle(sqlite);
      db.insert(photos)
        .values({
          uuid: 'u1',
          contentHash: 'hash1',
          filename: 'a.jpg',
          originalPath: 'u1.jpg',
          thumbnailPath: 'thumbnails/thumb_u1.jpg',
          blurhash: 'b',
          width: 10,
          height: 10,
          aspectRatio: 1,
          tags: 'beach',
          tagsEmbedding: f32(0.5, 0.5),
          facesProcessedAt: new Date(),
          dogsProcessedAt: new Date(),
        })
        .run();
      db.insert(faceClusters).values({ id: 1, personLabel: 'Alice', ignored: false }).run();
      db.insert(faces)
        .values({
          photoUuid: 'u1',
          bboxX: 0.1,
          bboxY: 0.1,
          bboxW: 0.2,
          bboxH: 0.2,
          detScore: 0.9,
          embedding: f32(1, 0, 0),
          clusterId: 1,
        })
        .run();
      sqlite.close();
    }
    await publishToStorage({ dbPath: origPath, storage, version: 'v1' });

    // --- disaster: only photo rows survive (DB lost, re-ingested) ---
    const freshPath = path.join(tmp, 'fresh.db');
    {
      const sqlite = newDb(freshPath);
      drizzle(sqlite)
        .insert(photos)
        .values({
          uuid: 'u1',
          contentHash: 'hash1', // re-derived on re-ingest
          filename: 'a.jpg',
          originalPath: 'u1.jpg',
          thumbnailPath: 'thumbnails/thumb_u1.jpg',
          blurhash: 'b',
          width: 10,
          height: 10,
          aspectRatio: 1,
          // no tags, no facesProcessedAt — nothing computed yet
        })
        .run();
      sqlite.close();
    }

    // --- restore the expensive compute from sidecars (no model re-run) ---
    const restore = await restoreFromSidecars(freshPath, storage);
    expect(restore.photosTagged).toBe(1);
    expect(restore.facesRestored).toBe(1);

    // simulate re-clustering: a NEW cluster id (2) over the restored face
    {
      const sqlite = new Database(freshPath);
      const db = drizzle(sqlite);
      const faceRow = sqlite.prepare('SELECT id FROM faces').get() as { id: number };
      db.insert(faceClusters).values({ id: 2, personLabel: null, ignored: false }).run();
      sqlite.prepare('UPDATE faces SET cluster_id = 2 WHERE id = ?').run(faceRow.id);
      // tags/embedding restored?
      const p = sqlite.prepare('SELECT tags, length(tags_embedding) AS n FROM photos').get() as {
        tags: string;
        n: number;
      };
      expect(p.tags).toBe('beach');
      expect(p.n).toBeGreaterThan(0);
      sqlite.close();
    }

    // --- reattach labels: "Alice" lands on the new cluster 2 ---
    const applied = await applyLabels(freshPath, storage);
    expect(applied.peopleApplied).toBe(1);

    const sqlite = new Database(freshPath, { readonly: true });
    const cluster = sqlite
      .prepare('SELECT person_label FROM face_clusters WHERE id = 2')
      .get() as { person_label: string };
    sqlite.close();
    expect(cluster.person_label).toBe('Alice');
  });
});
