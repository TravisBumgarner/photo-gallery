import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dogClusters, dogs, faceClusters, faces, photos } from './db/schema.js';
import { parseLabels } from './labels.js';
import { publishToStorage } from './publish.js';
import { createStorage, KEYS } from './storage/index.js';

const MIGRATIONS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../backend/drizzle',
);

const f32 = (...xs: number[]) => Buffer.from(new Float32Array(xs).buffer);

describe('publishToStorage', () => {
  let tmp: string;
  let dbPath: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'publish-test-'));
    dbPath = path.join(tmp, 'ingest.db');

    const sqlite = new Database(dbPath);
    const db = drizzle(sqlite);
    migrate(db, { migrationsFolder: MIGRATIONS });

    // Two photos with content hashes; one tagged + embedded.
    db.insert(photos)
      .values([
        {
          uuid: 'u1',
          contentHash: 'hash1',
          filename: 'a.jpg',
          originalPath: 'u1.jpg',
          thumbnailPath: 'thumbnails/thumb_u1.jpg',
          blurhash: 'b',
          width: 100,
          height: 100,
          aspectRatio: 1,
          tags: 'beach, sun',
          tagsEmbedding: f32(0.1, 0.2),
        },
        {
          uuid: 'u2',
          contentHash: 'hash2',
          filename: 'b.jpg',
          originalPath: 'u2.jpg',
          thumbnailPath: 'thumbnails/thumb_u2.jpg',
          blurhash: 'b',
          width: 100,
          height: 100,
          aspectRatio: 1,
        },
      ])
      .run();

    // One labeled face cluster ("Alice") spanning both photos.
    db.insert(faceClusters)
      .values({ id: 1, personLabel: 'Alice', ignored: false })
      .run();
    db.insert(faces)
      .values([
        {
          photoUuid: 'u1',
          bboxX: 0.1,
          bboxY: 0.1,
          bboxW: 0.2,
          bboxH: 0.2,
          detScore: 0.9,
          embedding: f32(1, 0, 0),
          clusterId: 1,
        },
        {
          photoUuid: 'u2',
          bboxX: 0.3,
          bboxY: 0.3,
          bboxW: 0.2,
          bboxH: 0.2,
          detScore: 0.8,
          embedding: f32(0.9, 0.1, 0),
          clusterId: 1,
        },
      ])
      .run();

    // An unlabeled, non-ignored dog cluster — should NOT produce a label entry.
    db.insert(dogClusters).values({ id: 1, dogLabel: null, ignored: false }).run();
    db.insert(dogs)
      .values({
        photoUuid: 'u1',
        bboxX: 0.5,
        bboxY: 0.5,
        bboxW: 0.1,
        bboxH: 0.1,
        detScore: 0.7,
        embedding: f32(0, 1, 0),
        clusterId: 1,
      })
      .run();

    sqlite.close();
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('writes the fat DB, labels.json, and a slim DB + latest pointer; archives on republish', async () => {
    const storeDir = path.join(tmp, 'bucket');
    const storage = await createStorage(`file://${storeDir}`);

    const result = await publishToStorage({
      dbPath,
      storage,
      version: '2026-06-15T00-00-00Z',
    });

    expect(result.peopleLabels).toBe(1);
    expect(result.dogLabels).toBe(0); // unlabeled cluster skipped
    expect(result.backedUp).toBe(false); // nothing to archive on the first publish

    // The fat DB is published with embeddings intact (the durable artifact).
    const fatLocal = path.join(tmp, 'fat.db');
    await storage.getToFile(KEYS.dbFat(), fatLocal);
    const fat = new Database(fatLocal, { readonly: true });
    const fatFace = fat
      .prepare('SELECT length(embedding) AS n FROM faces')
      .get() as { n: number };
    fat.close();
    expect(fatFace.n).toBeGreaterThan(0); // embeddings preserved

    // labels.json pins "Alice" to both face anchors.
    const labels = parseLabels(await storage.get(KEYS.labels()));
    expect(labels.people).toHaveLength(1);
    expect(labels.people[0].label).toBe('Alice');
    expect(labels.people[0].anchors).toHaveLength(2);
    expect(labels.people[0].anchors.map((a) => a.contentHash).sort()).toEqual([
      'hash1',
      'hash2',
    ]);

    // latest pointer + slim DB present, embeddings stripped.
    const version = (await storage.get(KEYS.dbLatest())).toString();
    expect(version).toBe('2026-06-15T00-00-00Z');

    const slimLocal = path.join(tmp, 'slim.db');
    await storage.getToFile(KEYS.dbVersion(version), slimLocal);
    const slim = new Database(slimLocal, { readonly: true });
    const faceRow = slim.prepare('SELECT length(embedding) AS n FROM faces').get() as {
      n: number;
    };
    const tagRow = slim
      .prepare('SELECT tags_embedding AS e, tags FROM photos WHERE uuid = ?')
      .get('u1') as { e: Buffer | null; tags: string };
    slim.close();
    expect(faceRow.n).toBe(0); // embedding emptied
    expect(tagRow.e).toBeNull(); // tags_embedding nulled
    expect(tagRow.tags).toBe('beach, sun'); // but tags (cheap, useful) kept

    // Republishing archives the previous fat DB instead of clobbering it.
    const second = await publishToStorage({
      dbPath,
      storage,
      version: '2026-06-16T00-00-00Z',
    });
    expect(second.backedUp).toBe(true);
    expect(await storage.exists(KEYS.dbFatBackup('2026-06-16T00-00-00Z'))).toBe(
      true,
    );
  });

  it('keeps only the newest 5 DB backups', async () => {
    const storage = await createStorage(`file://${path.join(tmp, 'bucket2')}`);
    for (let i = 0; i < 7; i++) {
      await publishToStorage({
        dbPath,
        storage,
        version: `2026-06-${String(10 + i).padStart(2, '0')}T00-00-00Z`,
      });
    }
    // 7 publishes → 6 archives created, pruned down to the newest 5.
    const backups = await storage.list('db/backups');
    expect(backups).toHaveLength(5);
    expect(backups.some((k) => k.includes('2026-06-10'))).toBe(false); // oldest gone
    expect(backups.some((k) => k.includes('2026-06-16'))).toBe(true); // newest kept
  });
});
