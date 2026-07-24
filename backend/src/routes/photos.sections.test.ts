import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { asc, desc, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { photos } from 'shared/db/schema';
import { buildFilterConditions, querySections } from './photos.js';

// In-memory SQLite for testing
let sqlite: InstanceType<typeof Database>;
let db: ReturnType<typeof drizzle>;

type QueryDb = Parameters<typeof querySections>[0];

function seedPhotos() {
  const base = {
    blurhash: 'LEHV6nWB',
    width: 6000,
    height: 4000,
    aspectRatio: 1.5,
    lens: 'NIKKOR Z 50mm f/1.8 S',
    shutterSpeed: '1/250',
    focalLength: 50,
    keywords: '["landscape"]',
    fileSize: 12000000,
    mimeType: 'image/jpeg',
  };
  const rows = [
    {
      uuid: 'aaa-111',
      filename: 'sunset.jpg',
      camera: 'NIKON Z 6_2',
      dateCaptured: new Date('2024-01-15T10:30:00Z'),
      iso: 200,
      aperture: 1.8,
      rating: 4,
    },
    {
      uuid: 'bbb-222',
      filename: 'city.jpg',
      camera: 'Canon EOS R6',
      dateCaptured: new Date('2024-03-22T18:45:00Z'),
      iso: 800,
      aperture: 2.8,
      rating: 3,
    },
    {
      uuid: 'ccc-333',
      filename: 'portrait.jpg',
      camera: 'NIKON Z 6_2',
      dateCaptured: new Date('2024-01-24T14:00:00Z'),
      iso: 100,
      aperture: 1.8,
      rating: 5,
    },
    {
      uuid: 'ddd-444',
      filename: 'Food.jpg',
      camera: 'Canon EOS R6',
      dateCaptured: new Date('2024-06-15T12:00:00Z'),
      iso: 400,
      aperture: 5.6,
      rating: null,
    },
    // No EXIF: exercises NULL group placement (first asc, last desc)
    {
      uuid: 'eee-555',
      filename: 'scan.jpg',
      camera: null,
      dateCaptured: null,
      iso: null,
      aperture: null,
      rating: null,
    },
  ];
  for (const row of rows) {
    db.insert(photos)
      .values({
        ...base,
        ...row,
        originalPath: `/images/${row.uuid}.jpg`,
        thumbnailPath: `/thumbnails/${row.uuid}.jpg`,
      })
      .run();
  }
}

beforeAll(() => {
  sqlite = new Database(':memory:');
  db = drizzle(sqlite);

  const migrationsFolder = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../drizzle',
  );
  migrate(db, { migrationsFolder });

  seedPhotos();
});

afterAll(() => {
  sqlite.close();
});

describe('querySections', () => {
  it('groups date sorts by month, newest first for desc', async () => {
    const sections = await querySections(
      db as unknown as QueryDb,
      'dateCaptured',
      'desc',
      undefined,
    );
    expect(sections).toEqual([
      { key: '2024-06', count: 1 },
      { key: '2024-03', count: 1 },
      { key: '2024-01', count: 2 },
      { key: null, count: 1 },
    ]);
  });

  it('places the NULL group first for asc, matching SQLite NULL ordering', async () => {
    const sections = await querySections(
      db as unknown as QueryDb,
      'dateCaptured',
      'asc',
      undefined,
    );
    expect(sections.map((s) => s.key)).toEqual([
      null,
      '2024-01',
      '2024-03',
      '2024-06',
    ]);
  });

  it('groups by raw value for iso', async () => {
    const sections = await querySections(
      db as unknown as QueryDb,
      'iso',
      'asc',
      undefined,
    );
    expect(sections).toEqual([
      { key: null, count: 1 },
      { key: 100, count: 1 },
      { key: 200, count: 1 },
      { key: 400, count: 1 },
      { key: 800, count: 1 },
    ]);
  });

  it('groups by camera name', async () => {
    const sections = await querySections(
      db as unknown as QueryDb,
      'camera',
      'asc',
      undefined,
    );
    expect(sections).toEqual([
      { key: null, count: 1 },
      { key: 'Canon EOS R6', count: 2 },
      { key: 'NIKON Z 6_2', count: 2 },
    ]);
  });

  it('groups filename by uppercased first letter', async () => {
    const sections = await querySections(
      db as unknown as QueryDb,
      'filename',
      'asc',
      undefined,
    );
    expect(sections).toEqual([
      { key: 'C', count: 1 },
      { key: 'F', count: 1 },
      { key: 'P', count: 1 },
      { key: 'S', count: 2 },
    ]);
  });

  it('returns a single section for ungrouped sorts (rating)', async () => {
    const sections = await querySections(
      db as unknown as QueryDb,
      'rating',
      'desc',
      undefined,
    );
    expect(sections).toEqual([{ key: null, count: 5 }]);
  });

  it('respects filter conditions', async () => {
    const sections = await querySections(
      db as unknown as QueryDb,
      'dateCaptured',
      'desc',
      buildFilterConditions({ camera: 'NIKON Z 6_2' }),
    );
    expect(sections).toEqual([{ key: '2024-01', count: 2 }]);
  });

  it('stays in lockstep with the photo query order', async () => {
    // The client walks /photos results and assigns each photo to a section;
    // skip-ahead offsets are only correct if the section outline lists groups
    // in exactly the order (and with the counts) the photo stream produces.
    for (const sortOrder of ['asc', 'desc'] as const) {
      const orderFn = sortOrder === 'asc' ? asc : desc;
      const rows = db
        .select({ dateCaptured: photos.dateCaptured })
        .from(photos)
        .orderBy(orderFn(photos.dateCaptured), asc(photos.id))
        .all();

      const walked: { key: string | null; count: number }[] = [];
      for (const row of rows) {
        const key = row.dateCaptured
          ? row.dateCaptured.toISOString().substring(0, 7)
          : null;
        const last = walked[walked.length - 1];
        if (last && last.key === key) last.count += 1;
        else walked.push({ key, count: 1 });
      }

      const sections = await querySections(
        db as unknown as QueryDb,
        'dateCaptured',
        sortOrder,
        undefined,
      );
      expect(sections).toEqual(walked);
    }
  });

  it('returns no sections when nothing matches', async () => {
    const sections = await querySections(
      db as unknown as QueryDb,
      'rating',
      'desc',
      sql`1 = 0`,
    );
    expect(sections).toEqual([]);
  });
});
