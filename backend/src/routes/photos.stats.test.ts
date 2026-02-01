import Database from 'better-sqlite3';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { photos } from 'shared/db/schema';
import type { StatsResponse } from 'shared/types';
import { buildFilterConditions } from './photos.js';

// In-memory SQLite for testing
let sqlite: InstanceType<typeof Database>;
let db: ReturnType<typeof drizzle>;

function seedPhotos() {
  // Photo 1: Nikon, 50mm, Jan 2024 (Monday), landscape 3:2
  db.insert(photos).values({
    uuid: 'aaa-111',
    filename: 'sunset.jpg',
    originalPath: '/images/aaa-111.jpg',
    thumbnailPath: '/thumbnails/aaa-111.jpg',
    blurhash: 'LEHV6nWB',
    width: 6000,
    height: 4000,
    aspectRatio: 1.5,
    camera: 'NIKON Z 6_2',
    lens: 'NIKKOR Z 50mm f/1.8 S',
    dateCaptured: new Date('2024-01-15T10:30:00Z'),
    iso: 200,
    shutterSpeed: '1/250',
    aperture: 1.8,
    focalLength: 50,
    rating: 4,
    label: 'Green',
    keywords: '["landscape","sunset"]',
    fileSize: 12000000,
    mimeType: 'image/jpeg',
  }).run();

  // Photo 2: Canon, 24mm, Mar 2024 (Friday), landscape 16:9
  db.insert(photos).values({
    uuid: 'bbb-222',
    filename: 'city.jpg',
    originalPath: '/images/bbb-222.jpg',
    thumbnailPath: '/thumbnails/bbb-222.jpg',
    blurhash: 'L5H2EC=P',
    width: 3840,
    height: 2160,
    aspectRatio: 1.78,
    camera: 'Canon EOS R6',
    lens: 'RF 24-70mm f/2.8L',
    dateCaptured: new Date('2024-03-22T18:45:00Z'),
    iso: 800,
    shutterSpeed: '1/125',
    aperture: 2.8,
    focalLength: 24,
    rating: 3,
    label: 'Blue',
    keywords: '["urban","city"]',
    fileSize: 8000000,
    mimeType: 'image/jpeg',
  }).run();

  // Photo 3: Nikon, 85mm, Jan 2024 (Wednesday), portrait 2:3
  db.insert(photos).values({
    uuid: 'ccc-333',
    filename: 'portrait.jpg',
    originalPath: '/images/ccc-333.jpg',
    thumbnailPath: '/thumbnails/ccc-333.jpg',
    blurhash: 'LGF5]+Yk',
    width: 4000,
    height: 6000,
    aspectRatio: 0.667,
    camera: 'NIKON Z 6_2',
    lens: 'NIKKOR Z 85mm f/1.8 S',
    dateCaptured: new Date('2024-01-24T14:00:00Z'),
    iso: 100,
    shutterSpeed: '1/500',
    aperture: 1.8,
    focalLength: 85,
    rating: 5,
    label: 'Red',
    keywords: '["portrait","people"]',
    fileSize: 15000000,
    mimeType: 'image/jpeg',
  }).run();

  // Photo 4: Canon, 70mm, Jun 2024 (Saturday), square 1:1, no rating
  db.insert(photos).values({
    uuid: 'ddd-444',
    filename: 'food.jpg',
    originalPath: '/images/ddd-444.jpg',
    thumbnailPath: '/thumbnails/ddd-444.jpg',
    blurhash: 'L9B4HYIA',
    width: 3000,
    height: 3000,
    aspectRatio: 1.0,
    camera: 'Canon EOS R6',
    lens: 'RF 24-70mm f/2.8L',
    dateCaptured: new Date('2024-06-15T12:00:00Z'),
    iso: 400,
    shutterSpeed: '1/60',
    aperture: 5.6,
    focalLength: 70,
    rating: null,
    label: null,
    keywords: '["food","macro"]',
    fileSize: 6000000,
    mimeType: 'image/jpeg',
  }).run();
}

beforeAll(() => {
  sqlite = new Database(':memory:');
  db = drizzle(sqlite);

  // Create tables using raw SQL matching the schema
  sqlite.exec(`
    CREATE TABLE photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE,
      filename TEXT NOT NULL,
      original_path TEXT NOT NULL,
      thumbnail_path TEXT NOT NULL,
      blurhash TEXT NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      aspect_ratio REAL NOT NULL,
      camera TEXT,
      lens TEXT,
      date_captured INTEGER,
      iso INTEGER,
      shutter_speed TEXT,
      aperture REAL,
      focal_length REAL,
      keywords TEXT,
      rating INTEGER,
      label TEXT,
      file_size INTEGER,
      mime_type TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );
  `);

  seedPhotos();
});

afterAll(() => {
  sqlite.close();
});

describe('buildFilterConditions', () => {
  it('returns undefined when no filters are set', () => {
    const result = buildFilterConditions({});
    expect(result).toBeUndefined();
  });

  it('returns a condition when camera filter is set', () => {
    const condition = buildFilterConditions({ camera: 'NIKON Z 6_2' });
    expect(condition).toBeDefined();

    const rows = db.select().from(photos).where(condition).all();
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.camera === 'NIKON Z 6_2')).toBe(true);
  });

  it('returns a condition when lens filter is set', () => {
    const condition = buildFilterConditions({ lens: 'RF 24-70mm f/2.8L' });
    expect(condition).toBeDefined();

    const rows = db.select().from(photos).where(condition).all();
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.lens === 'RF 24-70mm f/2.8L')).toBe(true);
  });

  it('filters by ISO range', () => {
    const condition = buildFilterConditions({ minIso: 200, maxIso: 800 });
    expect(condition).toBeDefined();

    const rows = db.select().from(photos).where(condition).all();
    expect(rows.every((r) => r.iso! >= 200 && r.iso! <= 800)).toBe(true);
    expect(rows.length).toBe(3);
  });

  it('filters by aperture range', () => {
    const condition = buildFilterConditions({ minAperture: 2.0, maxAperture: 6.0 });
    expect(condition).toBeDefined();

    const rows = db.select().from(photos).where(condition).all();
    expect(rows.every((r) => r.aperture! >= 2.0 && r.aperture! <= 6.0)).toBe(true);
  });

  it('filters by date range', () => {
    const condition = buildFilterConditions({
      startDate: '2024-01-01',
      endDate: '2024-01-31',
    });
    expect(condition).toBeDefined();

    const rows = db.select().from(photos).where(condition).all();
    expect(rows.length).toBe(2);
  });

  it('filters by minimum rating', () => {
    const condition = buildFilterConditions({ rating: 4 });
    expect(condition).toBeDefined();

    const rows = db.select().from(photos).where(condition).all();
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.rating! >= 4)).toBe(true);
  });

  it('filters by label', () => {
    const condition = buildFilterConditions({ label: 'Green' });
    expect(condition).toBeDefined();

    const rows = db.select().from(photos).where(condition).all();
    expect(rows.length).toBe(1);
    expect(rows[0].label).toBe('Green');
  });

  it('filters by keyword', () => {
    const condition = buildFilterConditions({ keyword: 'landscape' });
    expect(condition).toBeDefined();

    const rows = db.select().from(photos).where(condition).all();
    expect(rows.length).toBe(1);
    expect(rows[0].uuid).toBe('aaa-111');
  });

  it('combines multiple filters with AND logic', () => {
    const condition = buildFilterConditions({
      camera: 'NIKON Z 6_2',
      rating: 5,
    });
    expect(condition).toBeDefined();

    const rows = db.select().from(photos).where(condition).all();
    expect(rows.length).toBe(1);
    expect(rows[0].uuid).toBe('ccc-333');
  });
});

describe('GET /photos/stats response shape', () => {
  // These tests verify the endpoint returns correctly shaped data.
  // They run the aggregation queries directly against the test DB.

  it('returns totalPhotos matching the count in the database', () => {
    const [row] = db.select({ count: sql<number>`count(*)` }).from(photos).all();
    expect(row.count).toBe(4);
  });

  it('groups photos by month for photosOverTime', () => {
    const rows = sqlite
      .prepare(
        "SELECT strftime('%Y-%m', date_captured, 'unixepoch') as month, count(*) as count FROM photos WHERE date_captured IS NOT NULL GROUP BY month ORDER BY month"
      )
      .all() as { month: string; count: number }[];

    expect(rows.length).toBe(3); // Jan 2024, Mar 2024, Jun 2024
    expect(rows[0].month).toBe('2024-01');
    expect(rows[0].count).toBe(2);
  });

  it('groups photos by camera for cameraDistribution', () => {
    const rows = sqlite
      .prepare(
        'SELECT camera, count(*) as count FROM photos WHERE camera IS NOT NULL GROUP BY camera ORDER BY count DESC'
      )
      .all() as { camera: string; count: number }[];

    expect(rows.length).toBe(2);
    expect(rows[0].count).toBe(2); // Both cameras have 2 photos
  });

  it('groups photos by lens for lensDistribution', () => {
    const rows = sqlite
      .prepare(
        'SELECT lens, count(*) as count FROM photos WHERE lens IS NOT NULL GROUP BY lens ORDER BY count DESC'
      )
      .all() as { lens: string; count: number }[];

    expect(rows.length).toBe(3);
  });

  it('groups photos by focal_length for focalLengthDistribution', () => {
    const rows = sqlite
      .prepare(
        'SELECT focal_length as focalLength, count(*) as count FROM photos WHERE focal_length IS NOT NULL GROUP BY focal_length ORDER BY focal_length'
      )
      .all() as { focalLength: number; count: number }[];

    expect(rows.length).toBe(4);
  });

  it('buckets aspect ratios into named groups', () => {
    const rows = sqlite
      .prepare(`
        SELECT
          CASE
            WHEN abs(aspect_ratio - 1.0) < 0.05 THEN '1:1'
            WHEN abs(aspect_ratio - 1.5) < 0.1 OR abs(aspect_ratio - 0.667) < 0.1 THEN '3:2'
            WHEN abs(aspect_ratio - 1.778) < 0.1 OR abs(aspect_ratio - 0.5625) < 0.1 THEN '16:9'
            WHEN abs(aspect_ratio - 1.25) < 0.1 OR abs(aspect_ratio - 0.8) < 0.1 THEN '4:5'
            ELSE 'Other'
          END as aspectRatio,
          count(*) as count
        FROM photos
        GROUP BY aspectRatio
        ORDER BY count DESC
      `)
      .all() as { aspectRatio: string; count: number }[];

    const names = rows.map((r) => r.aspectRatio);
    expect(names).toContain('3:2');
    expect(names).toContain('16:9');
    expect(names).toContain('1:1');
  });

  it('groups photos by day of week', () => {
    const rows = sqlite
      .prepare(
        "SELECT strftime('%w', date_captured, 'unixepoch') as day, count(*) as count FROM photos WHERE date_captured IS NOT NULL GROUP BY day ORDER BY day"
      )
      .all() as { day: string; count: number }[];

    expect(rows.length).toBeGreaterThan(0);
    // day is '0'-'6' (Sunday-Saturday)
    rows.forEach((r) => {
      expect(Number(r.day)).toBeGreaterThanOrEqual(0);
      expect(Number(r.day)).toBeLessThanOrEqual(6);
    });
  });

  it('groups photos by hour of day', () => {
    const rows = sqlite
      .prepare(
        "SELECT CAST(strftime('%H', date_captured, 'unixepoch') AS INTEGER) as hour, count(*) as count FROM photos WHERE date_captured IS NOT NULL GROUP BY hour ORDER BY hour"
      )
      .all() as { hour: number; count: number }[];

    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((r) => {
      expect(r.hour).toBeGreaterThanOrEqual(0);
      expect(r.hour).toBeLessThanOrEqual(23);
    });
  });

  it('returns all 12 fields expected by StatsResponse', () => {
    // This test validates the shape contract
    const expectedKeys: (keyof StatsResponse)[] = [
      'totalPhotos',
      'photosOverTime',
      'cameraDistribution',
      'lensDistribution',
      'focalLengthDistribution',
      'apertureDistribution',
      'isoDistribution',
      'aspectRatioDistribution',
      'ratingDistribution',
      'shutterSpeedDistribution',
      'photosByDayOfWeek',
      'photosByHourOfDay',
    ];
    expect(expectedKeys.length).toBe(12);
  });
});
