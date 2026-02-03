import {
  type AnyColumn,
  type SQL,
  and,
  asc,
  desc,
  getTableColumns,
  gte,
  like,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import { Router } from 'express';
import { createDb } from 'shared/db';
import { photos } from 'shared/db/schema';
import { photoFiltersSchema, statsFiltersSchema } from 'shared/schemas';
import type { StatsResponse } from 'shared/types';
import { config } from '../config.js';

const db = createDb(config.DATABASE_URL);

export const router = Router();

/** Build WHERE conditions from filter params. Used by /photos and /photos/stats. */
export function buildFilterConditions(filters: {
  search?: string;
  camera?: string;
  lens?: string;
  minIso?: number;
  maxIso?: number;
  minAperture?: number;
  maxAperture?: number;
  startDate?: string;
  endDate?: string;
  aspectRatio?: string;
  orientation?: string;
  rating?: number;
  label?: string;
  keyword?: string;
  folder?: string;
}): SQL | undefined {
  const conditions: (SQL | undefined)[] = [];

  if (filters.search) {
    conditions.push(
      or(
        like(photos.filename, `%${filters.search}%`),
        like(photos.keywords, `%${filters.search}%`),
        like(photos.camera, `%${filters.search}%`),
      ),
    );
  }

  if (filters.camera) {
    const cameras = filters.camera.split(',').filter(Boolean);
    if (cameras.length === 1) {
      conditions.push(sql`${photos.camera} = ${cameras[0]}`);
    } else if (cameras.length > 1) {
      conditions.push(or(...cameras.map((c) => sql`${photos.camera} = ${c}`)));
    }
  }

  if (filters.lens) {
    const lenses = filters.lens.split(',').filter(Boolean);
    if (lenses.length === 1) {
      conditions.push(sql`${photos.lens} = ${lenses[0]}`);
    } else if (lenses.length > 1) {
      conditions.push(or(...lenses.map((l) => sql`${photos.lens} = ${l}`)));
    }
  }

  if (filters.minIso !== undefined) {
    conditions.push(gte(photos.iso, filters.minIso));
  }
  if (filters.maxIso !== undefined) {
    conditions.push(lte(photos.iso, filters.maxIso));
  }

  if (filters.minAperture !== undefined) {
    conditions.push(gte(photos.aperture, filters.minAperture));
  }
  if (filters.maxAperture !== undefined) {
    conditions.push(lte(photos.aperture, filters.maxAperture));
  }

  if (filters.startDate) {
    const startTimestamp = Math.floor(new Date(filters.startDate).getTime() / 1000);
    conditions.push(sql`${photos.dateCaptured} >= ${startTimestamp}`);
  }
  if (filters.endDate) {
    const endTimestamp =
      Math.floor(new Date(filters.endDate).getTime() / 1000) + 86399;
    conditions.push(sql`${photos.dateCaptured} <= ${endTimestamp}`);
  }

  if (filters.aspectRatio) {
    const ratios = filters.aspectRatio.split(',').filter(Boolean);
    const ratioConditions = ratios.flatMap((r) => {
      const ratio = parseFloat(r);
      const tolerance = 0.1;
      const portraitMatch = and(
        gte(photos.aspectRatio, ratio - tolerance),
        lte(photos.aspectRatio, ratio + tolerance),
      );
      if (Math.abs(ratio - 1) > tolerance) {
        const inverse = 1 / ratio;
        const landscapeMatch = and(
          gte(photos.aspectRatio, inverse - tolerance),
          lte(photos.aspectRatio, inverse + tolerance),
        );
        return [portraitMatch, landscapeMatch];
      }
      return [portraitMatch];
    });
    if (ratioConditions.length === 1) {
      conditions.push(ratioConditions[0]);
    } else if (ratioConditions.length > 1) {
      conditions.push(or(...ratioConditions));
    }
  }

  if (filters.orientation) {
    const orientations = filters.orientation.split(',').filter(Boolean);
    const squareTolerance = 0.05;
    const orientationConditions = orientations.map((o) => {
      if (o === 'square') {
        return and(
          gte(photos.aspectRatio, 1 - squareTolerance),
          lte(photos.aspectRatio, 1 + squareTolerance),
        );
      }
      if (o === 'portrait') {
        return lte(photos.aspectRatio, 1 - squareTolerance);
      }
      return gte(photos.aspectRatio, 1 + squareTolerance);
    });
    if (orientationConditions.length === 1) {
      conditions.push(orientationConditions[0]);
    } else if (orientationConditions.length > 1) {
      conditions.push(or(...orientationConditions));
    }
  }

  if (filters.rating !== undefined) {
    conditions.push(sql`${photos.rating} >= ${filters.rating}`);
  }

  if (filters.label) {
    const labels = filters.label.split(',').filter(Boolean);
    if (labels.length === 1) {
      conditions.push(sql`${photos.label} = ${labels[0]}`);
    } else if (labels.length > 1) {
      conditions.push(or(...labels.map((l) => sql`${photos.label} = ${l}`)));
    }
  }

  if (filters.keyword) {
    const keywords = filters.keyword.split(',').filter(Boolean);
    if (keywords.length === 1) {
      conditions.push(like(photos.keywords, `%"${keywords[0]}"%`));
    } else if (keywords.length > 1) {
      conditions.push(or(...keywords.map((k) => like(photos.keywords, `%"${k}"%`))));
    }
  }

  if (filters.folder) {
    const escapeLike = (s: string) =>
      s.replace(/%/g, '\\%').replace(/_/g, '\\_');
    const segments = filters.folder.split('/').map(escapeLike);
    const jsonPrefix = `["${segments.join('","')}"`;
    conditions.push(like(photos.keywords, `${jsonPrefix}%`));
  }

  if (conditions.length === 0) {
    return undefined;
  }

  return and(...conditions);
}

// In-memory metadata cache
let metadataCache: {
  data: Record<string, unknown>;
  timestamp: number;
} | null = null;
const METADATA_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function invalidateMetadataCache() {
  metadataCache = null;
}

// Get photos with pagination, filters, and search
router.get('/photos', async (req, res) => {
  try {
    const parsed = photoFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid query parameters',
        details: parsed.error.flatten(),
      });
      return;
    }

    const { page: pageNum, limit: limitNum, sortBy, sortOrder, ...filterParams } = parsed.data;

    const offset = (pageNum - 1) * limitNum;

    const whereClause = buildFilterConditions(filterParams);

    // Determine sort column and order
    const validSortColumns: Record<string, AnyColumn> = {
      dateCaptured: photos.dateCaptured,
      filename: photos.filename,
      rating: photos.rating,
      createdAt: photos.createdAt,
    };
    const orderFn = sortOrder === 'asc' ? asc : desc;
    const orderByColumn = validSortColumns[sortBy] ?? photos.dateCaptured;

    // Execute query with window function to get total count in a single pass
    const rows = await db
      .select({
        ...getTableColumns(photos),
        totalCount: sql<number>`count(*) over()`.as('totalCount'),
      })
      .from(photos)
      .where(whereClause)
      .orderBy(orderFn(orderByColumn))
      .limit(limitNum)
      .offset(offset);

    const total = rows.length > 0 ? rows[0].totalCount : 0;
    // Strip totalCount from response rows
    const allPhotos = rows.map(({ totalCount: _, ...photo }) => photo);

    res.json({
      photos: allPhotos,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
        hasMore: pageNum * limitNum < total,
      },
    });
  } catch (error) {
    console.error('Error fetching photos:', error);
    res.status(500).json({ error: 'Failed to fetch photos' });
  }
});

// Get autocomplete suggestions (must be before /photos/:id)
router.get('/photos/autocomplete', async (req, res) => {
  try {
    const { query = '' } = req.query;
    const searchTerm = query as string;

    if (!searchTerm || searchTerm.length < 2) {
      return res.json([]);
    }

    // Get matching filenames
    const filenameMatches = await db
      .selectDistinct({ value: photos.filename })
      .from(photos)
      .where(like(photos.filename, `%${searchTerm}%`))
      .limit(10);

    // Get matching cameras
    const cameraMatches = await db
      .selectDistinct({ value: photos.camera })
      .from(photos)
      .where(
        and(
          sql`${photos.camera} IS NOT NULL`,
          like(photos.camera, `%${searchTerm}%`),
        ),
      )
      .limit(5);

    // Get matching keywords
    const keywordMatches = await db
      .selectDistinct({ value: photos.keywords })
      .from(photos)
      .where(
        and(
          sql`${photos.keywords} IS NOT NULL`,
          like(photos.keywords, `%${searchTerm}%`),
        ),
      )
      .limit(10);

    // Extract and flatten keywords
    const keywords = new Set<string>();
    keywordMatches.forEach((row) => {
      if (row.value) {
        try {
          const parsed = JSON.parse(row.value);
          if (Array.isArray(parsed)) {
            parsed.forEach((kw: string) => {
              if (kw.toLowerCase().includes(searchTerm.toLowerCase())) {
                keywords.add(kw);
              }
            });
          }
        } catch (_e) {
          // Skip invalid JSON
        }
      }
    });

    // Combine all suggestions
    const suggestions = [
      ...filenameMatches.map((f) => f.value),
      ...cameraMatches.map((c) => c.value),
      ...Array.from(keywords).slice(0, 10),
    ]
      .filter(Boolean)
      .slice(0, 20);

    res.json(suggestions);
  } catch (error) {
    console.error('Error fetching autocomplete suggestions:', error);
    res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

// Get grouped suggestions for search (when focused)
router.get('/photos/suggestions', async (_req, res) => {
  try {
    // Get top cameras
    const topCameras = await db
      .select({
        value: photos.camera,
        count: sql<number>`count(*) as count`,
      })
      .from(photos)
      .where(sql`${photos.camera} IS NOT NULL`)
      .groupBy(photos.camera)
      .orderBy(desc(sql`count(*)`))
      .limit(8);

    // Get popular keywords
    const allKeywords = await db
      .select({ value: photos.keywords })
      .from(photos)
      .where(sql`${photos.keywords} IS NOT NULL`)
      .limit(100);

    const keywordCounts = new Map<string, number>();
    allKeywords.forEach((row) => {
      if (row.value) {
        try {
          const parsed = JSON.parse(row.value);
          if (Array.isArray(parsed)) {
            parsed.forEach((kw: string) => {
              keywordCounts.set(kw, (keywordCounts.get(kw) || 0) + 1);
            });
          }
        } catch (_e) {
          // Skip invalid JSON
        }
      }
    });

    const topKeywords = Array.from(keywordCounts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 12)
      .map(([keyword]) => keyword);

    // Get recent files (sample of filenames)
    const recentFiles = await db
      .select({ value: photos.filename })
      .from(photos)
      .orderBy(desc(photos.createdAt))
      .limit(6);

    res.json({
      cameras: topCameras.map((c) => c.value),
      keywords: topKeywords,
      files: recentFiles.map((f) => f.value),
    });
  } catch (error) {
    console.error('Error fetching suggestions:', error);
    res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

// Consolidated metadata endpoint — replaces individual meta/* endpoints
router.get('/photos/meta', async (_req, res) => {
  try {
    // Return cached data if still valid
    if (metadataCache && Date.now() - metadataCache.timestamp < METADATA_CACHE_TTL) {
      return res.json(metadataCache.data);
    }

    const cameras = await db
      .selectDistinct({ camera: photos.camera })
      .from(photos)
      .where(sql`${photos.camera} IS NOT NULL`)
      .orderBy(asc(photos.camera));

    const lenses = await db
      .selectDistinct({ lens: photos.lens })
      .from(photos)
      .where(sql`${photos.lens} IS NOT NULL`)
      .orderBy(asc(photos.lens));

    const isoValues = await db
      .selectDistinct({ iso: photos.iso })
      .from(photos)
      .where(sql`${photos.iso} IS NOT NULL`)
      .orderBy(asc(photos.iso));

    const apertureValues = await db
      .selectDistinct({ aperture: photos.aperture })
      .from(photos)
      .where(sql`${photos.aperture} IS NOT NULL`)
      .orderBy(asc(photos.aperture));

    const dates = await db
      .selectDistinct({
        date: sql<string>`DATE(${photos.dateCaptured}, 'unixepoch')`,
      })
      .from(photos)
      .where(sql`${photos.dateCaptured} IS NOT NULL`)
      .orderBy(desc(sql`DATE(${photos.dateCaptured}, 'unixepoch')`));

    const dateGroups = await db
      .select({
        date: sql<string>`DATE(date_captured, 'unixepoch')`,
        count: sql<number>`count(*)`,
      })
      .from(photos)
      .where(sql`${photos.dateCaptured} IS NOT NULL`)
      .groupBy(sql`DATE(date_captured, 'unixepoch')`)
      .orderBy(desc(sql`DATE(date_captured, 'unixepoch')`));

    // Use json_each() to extract keywords in SQL instead of loading all rows
    const keywordRows = db.$client
      .prepare('SELECT DISTINCT value FROM photos, json_each(photos.keywords) WHERE keywords IS NOT NULL ORDER BY value')
      .all() as { value: string }[];

    const labels = await db
      .selectDistinct({ label: photos.label })
      .from(photos)
      .where(sql`${photos.label} IS NOT NULL`)
      .orderBy(asc(photos.label));

    const dateCounts: Record<string, number> = {};
    dateGroups.forEach((item) => {
      dateCounts[item.date] = item.count;
    });

    // Build folder paths from keyword arrays (each keyword array represents a folder hierarchy)
    const folderRows = db.$client
      .prepare('SELECT keywords FROM photos WHERE keywords IS NOT NULL')
      .all() as { keywords: string }[];
    const folderSet = new Set<string>();
    folderRows.forEach((row) => {
      try {
        const parsed = JSON.parse(row.keywords);
        if (Array.isArray(parsed)) {
          for (let i = 1; i <= parsed.length; i++) {
            folderSet.add(parsed.slice(0, i).join('/'));
          }
        }
      } catch {
        // Skip invalid JSON
      }
    });
    const folders = Array.from(folderSet).sort((a, b) => a.localeCompare(b));

    const data = {
      cameras: cameras.map((c) => c.camera),
      lenses: lenses.map((l) => l.lens),
      isoValues: isoValues.map((i) => i.iso),
      apertureValues: apertureValues.map((a) => a.aperture),
      dates: dates.map((d) => d.date),
      dateCounts,
      keywords: keywordRows.map((r) => r.value),
      labels: labels.map((l) => l.label),
      folders,
    };

    metadataCache = { data, timestamp: Date.now() };
    res.json(data);
  } catch (error) {
    console.error('Error fetching metadata:', error);
    res.status(500).json({ error: 'Failed to fetch metadata' });
  }
});

// Stats endpoint — aggregated photo statistics with filters
router.get('/photos/stats', async (req, res) => {
  try {
    const parsed = statsFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid query parameters',
        details: parsed.error.flatten(),
      });
      return;
    }

    const whereCondition = buildFilterConditions(parsed.data);
    const client = db.$client;

    // Use a CTE (Common Table Expression) to apply drizzle-built WHERE once,
    // then run all aggregation queries against the filtered set.
    // First, get the filtered IDs using drizzle, then use raw SQL for aggregations.
    const filteredRows = db
      .select({ id: photos.id })
      .from(photos)
      .where(whereCondition)
      .all();
    const filteredIds = filteredRows.map((r) => r.id);

    // If no photos match filters, return empty result
    if (filteredIds.length === 0 && whereCondition) {
      const result: StatsResponse = {
        totalPhotos: 0,
        photosOverTime: [],
        cameraDistribution: [],
        lensDistribution: [],
        focalLengthDistribution: [],
        apertureDistribution: [],
        isoDistribution: [],
        aspectRatioDistribution: [],
        ratingDistribution: [],
        shutterSpeedDistribution: [],
        photosByDayOfWeek: [],
        photosByHourOfDay: [],
        photosByYear: [],
        yearOverYear: [],
        cameraLensCombinations: [],
        photosByDate: [],
        topDays: [],
        cameraUsageOverTime: [],
        lensUsageOverTime: [],
        focalLengthVsAperture: [],
      };
      return res.json(result);
    }

    // Build a WHERE clause for raw SQL using the filtered IDs
    const idFilter = whereCondition
      ? `WHERE id IN (${filteredIds.join(',')})`
      : '';
    const idFilterAnd = whereCondition
      ? `WHERE id IN (${filteredIds.join(',')}) AND`
      : 'WHERE';

    // 1. Total photos
    const totalPhotos = filteredIds.length > 0 || !whereCondition
      ? (whereCondition ? filteredIds.length : (client
          .prepare('SELECT count(*) as count FROM photos')
          .get() as { count: number }).count)
      : 0;

    // 2. Photos over time (by month)
    const photosOverTime = client
      .prepare(
        `SELECT strftime('%Y-%m', date_captured, 'unixepoch') as month, count(*) as count
         FROM photos
         ${idFilterAnd} date_captured IS NOT NULL
         GROUP BY month ORDER BY month`
      )
      .all() as { month: string; count: number }[];

    // 3. Camera distribution
    const cameraDistribution = client
      .prepare(
        `SELECT camera, count(*) as count FROM photos
         ${idFilterAnd} camera IS NOT NULL
         GROUP BY camera ORDER BY count DESC`
      )
      .all() as { camera: string; count: number }[];

    // 4. Lens distribution
    const lensDistribution = client
      .prepare(
        `SELECT lens, count(*) as count FROM photos
         ${idFilterAnd} lens IS NOT NULL
         GROUP BY lens ORDER BY count DESC`
      )
      .all() as { lens: string; count: number }[];

    // 5. Focal length distribution
    const focalLengthDistribution = client
      .prepare(
        `SELECT focal_length as focalLength, count(*) as count FROM photos
         ${idFilterAnd} focal_length IS NOT NULL
         GROUP BY focal_length ORDER BY focal_length`
      )
      .all() as { focalLength: number; count: number }[];

    // 6. Aperture distribution
    const apertureDistribution = client
      .prepare(
        `SELECT aperture, count(*) as count FROM photos
         ${idFilterAnd} aperture IS NOT NULL
         GROUP BY aperture ORDER BY aperture`
      )
      .all() as { aperture: number; count: number }[];

    // 7. ISO distribution
    const isoDistribution = client
      .prepare(
        `SELECT iso, count(*) as count FROM photos
         ${idFilterAnd} iso IS NOT NULL
         GROUP BY iso ORDER BY iso`
      )
      .all() as { iso: number; count: number }[];

    // 8. Aspect ratio distribution (bucketed into named groups)
    const aspectRatioDistribution = client
      .prepare(
        `SELECT
          CASE
            WHEN abs(aspect_ratio - 1.0) < 0.05 THEN '1:1'
            WHEN abs(aspect_ratio - 1.5) < 0.1 OR abs(aspect_ratio - 0.667) < 0.1 THEN '3:2'
            WHEN abs(aspect_ratio - 1.778) < 0.1 OR abs(aspect_ratio - 0.5625) < 0.1 THEN '16:9'
            WHEN abs(aspect_ratio - 1.25) < 0.1 OR abs(aspect_ratio - 0.8) < 0.1 THEN '4:5'
            ELSE 'Other'
          END as aspectRatio,
          count(*) as count
        FROM photos
        ${idFilter}
        GROUP BY aspectRatio
        ORDER BY count DESC`
      )
      .all() as { aspectRatio: string; count: number }[];

    // 9. Rating distribution
    const ratingDistribution = client
      .prepare(
        `SELECT rating, count(*) as count FROM photos
         ${idFilterAnd} rating IS NOT NULL
         GROUP BY rating ORDER BY rating`
      )
      .all() as { rating: number; count: number }[];

    // 10. Shutter speed distribution
    const shutterSpeedDistribution = client
      .prepare(
        `SELECT shutter_speed as shutterSpeed, count(*) as count FROM photos
         ${idFilterAnd} shutter_speed IS NOT NULL
         GROUP BY shutter_speed ORDER BY count DESC`
      )
      .all() as { shutterSpeed: string; count: number }[];

    // 11. Photos by day of week
    const photosByDayOfWeek = client
      .prepare(
        `SELECT strftime('%w', date_captured, 'unixepoch') as day, count(*) as count
         FROM photos
         ${idFilterAnd} date_captured IS NOT NULL
         GROUP BY day ORDER BY day`
      )
      .all() as { day: string; count: number }[];

    // 12. Photos by hour of day
    const photosByHourOfDay = client
      .prepare(
        `SELECT CAST(strftime('%H', date_captured, 'unixepoch') AS INTEGER) as hour, count(*) as count
         FROM photos
         ${idFilterAnd} date_captured IS NOT NULL
         GROUP BY hour ORDER BY hour`
      )
      .all() as { hour: number; count: number }[];

    // 13. Photos by year
    const photosByYear = client
      .prepare(
        `SELECT strftime('%Y', date_captured, 'unixepoch') as year, count(*) as count
         FROM photos
         ${idFilterAnd} date_captured IS NOT NULL
         GROUP BY year ORDER BY year`
      )
      .all() as { year: string; count: number }[];

    // 14. Year-over-year comparison (photos per month, grouped by year)
    const yearOverYearRaw = client
      .prepare(
        `SELECT
           CAST(strftime('%m', date_captured, 'unixepoch') AS INTEGER) as month,
           strftime('%Y', date_captured, 'unixepoch') as year,
           count(*) as count
         FROM photos
         ${idFilterAnd} date_captured IS NOT NULL
         GROUP BY year, month
         ORDER BY month, year`
      )
      .all() as { month: number; year: string; count: number }[];

    // Transform into format suitable for multi-line chart
    type YearOverYearEntry = { month: number; [year: string]: number };
    const yearOverYearMap = new Map<number, YearOverYearEntry>();
    yearOverYearRaw.forEach(({ month, year, count }) => {
      if (!yearOverYearMap.has(month)) {
        yearOverYearMap.set(month, { month });
      }
      yearOverYearMap.get(month)![year] = count;
    });
    const yearOverYear = Array.from(yearOverYearMap.values()).sort(
      (a, b) => a.month - b.month
    );

    // 15. Camera + Lens combinations
    const cameraLensCombinations = client
      .prepare(
        `SELECT camera, lens, count(*) as count
         FROM photos
         ${idFilterAnd} camera IS NOT NULL AND lens IS NOT NULL
         GROUP BY camera, lens
         ORDER BY count DESC
         LIMIT 50`
      )
      .all() as { camera: string; lens: string; count: number }[];

    // 16. Photos by date (for calendar heatmap)
    const photosByDate = client
      .prepare(
        `SELECT DATE(date_captured, 'unixepoch') as date, count(*) as count
         FROM photos
         ${idFilterAnd} date_captured IS NOT NULL
         GROUP BY date
         ORDER BY date`
      )
      .all() as { date: string; count: number }[];

    // 17. Top 10 most productive days
    const topDays = client
      .prepare(
        `SELECT DATE(date_captured, 'unixepoch') as date, count(*) as count
         FROM photos
         ${idFilterAnd} date_captured IS NOT NULL
         GROUP BY date
         ORDER BY count DESC
         LIMIT 10`
      )
      .all() as { date: string; count: number }[];

    // 18. Camera usage over time (monthly)
    const cameraUsageOverTime = client
      .prepare(
        `SELECT strftime('%Y-%m', date_captured, 'unixepoch') as month, camera, count(*) as count
         FROM photos
         ${idFilterAnd} date_captured IS NOT NULL AND camera IS NOT NULL
         GROUP BY month, camera
         ORDER BY month, count DESC`
      )
      .all() as { month: string; camera: string; count: number }[];

    // 19. Lens usage over time (monthly)
    const lensUsageOverTime = client
      .prepare(
        `SELECT strftime('%Y-%m', date_captured, 'unixepoch') as month, lens, count(*) as count
         FROM photos
         ${idFilterAnd} date_captured IS NOT NULL AND lens IS NOT NULL
         GROUP BY month, lens
         ORDER BY month, count DESC`
      )
      .all() as { month: string; lens: string; count: number }[];

    // 20. Focal length vs aperture scatter data
    const focalLengthVsAperture = client
      .prepare(
        `SELECT focal_length as focalLength, aperture, count(*) as count
         FROM photos
         ${idFilterAnd} focal_length IS NOT NULL AND aperture IS NOT NULL
         GROUP BY focal_length, aperture
         ORDER BY count DESC
         LIMIT 500`
      )
      .all() as { focalLength: number; aperture: number; count: number }[];

    const result: StatsResponse = {
      totalPhotos,
      photosOverTime,
      cameraDistribution,
      lensDistribution,
      focalLengthDistribution,
      apertureDistribution,
      isoDistribution,
      aspectRatioDistribution,
      ratingDistribution,
      shutterSpeedDistribution,
      photosByDayOfWeek,
      photosByHourOfDay,
      photosByYear,
      yearOverYear,
      cameraLensCombinations,
      photosByDate,
      topDays,
      cameraUsageOverTime,
      lensUsageOverTime,
      focalLengthVsAperture,
    };

    res.json(result);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Get single photo by ID (must be after specific routes)
router.get('/photos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const photo = await db
      .select()
      .from(photos)
      .where(sql`${photos.id} = ${id}`)
      .limit(1);

    if (photo.length === 0) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    res.json(photo[0]);
  } catch (error) {
    console.error('Error fetching photo:', error);
    res.status(500).json({ error: 'Failed to fetch photo' });
  }
});
