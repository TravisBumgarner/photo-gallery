import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { faceClusters, faces, photos } from './db/schema.js';
import { publishToStorage } from './publish.js';
import { applyLabels } from './rebuild.js';
import { createStorage, KEYS } from './storage/index.js';

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

describe('rebuild from the published fat DB', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rebuild-test-'));
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('restores the DB from backup + reattaches labels after re-cluster', async () => {
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

    // --- disaster: working DB lost. Restore = pull the published fat DB. ---
    const freshPath = path.join(tmp, 'fresh.db');
    await storage.getToFile(KEYS.dbFat(), freshPath);

    // The fat DB brought everything back, embeddings intact (no model re-run).
    {
      const sqlite = new Database(freshPath, { readonly: true });
      const p = sqlite
        .prepare('SELECT tags, length(tags_embedding) AS n FROM photos')
        .get() as { tags: string; n: number };
      const fn = sqlite.prepare('SELECT length(embedding) AS n FROM faces').get() as {
        n: number;
      };
      sqlite.close();
      expect(p.tags).toBe('beach');
      expect(p.n).toBeGreaterThan(0);
      expect(fn.n).toBeGreaterThan(0); // fat DB keeps face embeddings
    }

    // --- simulate re-clustering: a NEW cluster id (2), unlabeled, over the face ---
    {
      const sqlite = new Database(freshPath);
      sqlite.prepare('DELETE FROM face_clusters').run();
      sqlite
        .prepare('INSERT INTO face_clusters (id, person_label, ignored) VALUES (2, NULL, 0)')
        .run();
      sqlite.prepare('UPDATE faces SET cluster_id = 2').run();
      sqlite.close();
    }

    // --- reattach labels: "Alice" lands on the new cluster 2 via labels.json ---
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
