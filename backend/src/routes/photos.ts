import {
  type AnyColumn,
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
import { photoFiltersSchema } from 'shared/schemas';
import { config } from '../config.js';

const db = createDb(config.DATABASE_URL);

export const router = Router();

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

    const {
      page: pageNum,
      limit: limitNum,
      search,
      camera,
      lens,
      minIso,
      maxIso,
      minAperture,
      maxAperture,
      startDate,
      endDate,
      aspectRatio,
      orientation,
      rating,
      label,
      keyword,
      folder,
      sortBy,
      sortOrder,
    } = parsed.data;

    const offset = (pageNum - 1) * limitNum;

    // Build where conditions
    const conditions = [];

    // Search in filename and keywords
    if (search) {
      conditions.push(
        or(
          like(photos.filename, `%${search}%`),
          like(photos.keywords, `%${search}%`),
          like(photos.camera, `%${search}%`),
        ),
      );
    }

    // Filter by camera (supports comma-separated multi-select)
    if (camera) {
      const cameras = camera.split(',').filter(Boolean);
      if (cameras.length === 1) {
        conditions.push(like(photos.camera, `%${cameras[0]}%`));
      } else if (cameras.length > 1) {
        conditions.push(
          or(...cameras.map((c) => like(photos.camera, `%${c}%`))),
        );
      }
    }

    // Filter by lens (supports comma-separated multi-select)
    if (lens) {
      const lenses = lens.split(',').filter(Boolean);
      if (lenses.length === 1) {
        conditions.push(like(photos.lens, `%${lenses[0]}%`));
      } else if (lenses.length > 1) {
        conditions.push(or(...lenses.map((l) => like(photos.lens, `%${l}%`))));
      }
    }

    // Filter by ISO range
    if (minIso !== undefined) {
      conditions.push(gte(photos.iso, minIso));
    }
    if (maxIso !== undefined) {
      conditions.push(lte(photos.iso, maxIso));
    }

    // Filter by aperture range
    if (minAperture !== undefined) {
      conditions.push(gte(photos.aperture, minAperture));
    }
    if (maxAperture !== undefined) {
      conditions.push(lte(photos.aperture, maxAperture));
    }

    // Filter by date range
    if (startDate) {
      const startTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
      conditions.push(sql`${photos.dateCaptured} >= ${startTimestamp}`);
    }
    if (endDate) {
      const endTimestamp =
        Math.floor(new Date(endDate).getTime() / 1000) + 86399; // Add 23:59:59
      conditions.push(sql`${photos.dateCaptured} <= ${endTimestamp}`);
    }

    // Filter by aspect ratio (supports comma-separated multi-select, matches both orientations)
    if (aspectRatio) {
      const ratios = aspectRatio.split(',').filter(Boolean);
      const ratioConditions = ratios.flatMap((r) => {
        const ratio = parseFloat(r);
        const tolerance = 0.1;
        const portraitMatch = and(
          gte(photos.aspectRatio, ratio - tolerance),
          lte(photos.aspectRatio, ratio + tolerance),
        );
        // For non-square ratios, also match the inverse (other orientation)
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

    // Filter by orientation (supports comma-separated multi-select)
    if (orientation) {
      const orientations = orientation.split(',').filter(Boolean);
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
        // landscape
        return gte(photos.aspectRatio, 1 + squareTolerance);
      });
      if (orientationConditions.length === 1) {
        conditions.push(orientationConditions[0]);
      } else if (orientationConditions.length > 1) {
        conditions.push(or(...orientationConditions));
      }
    }

    // Filter by rating
    if (rating !== undefined) {
      conditions.push(sql`${photos.rating} >= ${rating}`);
    }

    // Filter by label
    if (label) {
      conditions.push(sql`${photos.label} = ${label}`);
    }

    // Filter by keyword (supports comma-separated multi-select)
    if (keyword) {
      const keywords = keyword.split(',').filter(Boolean);
      if (keywords.length === 1) {
        conditions.push(like(photos.keywords, `%"${keywords[0]}"%`));
      } else if (keywords.length > 1) {
        conditions.push(
          or(...keywords.map((kw) => like(photos.keywords, `%"${kw}"%`))),
        );
      }
    }

    // Filter by folder path (prefix match on JSON keywords array)
    if (folder) {
      const escapeLike = (s: string) =>
        s.replace(/%/g, '\\%').replace(/_/g, '\\_');
      const segments = folder.split('/').map(escapeLike);
      const jsonPrefix = `["${segments.join('","')}"`;
      conditions.push(like(photos.keywords, `${jsonPrefix}%`));
    }

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
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
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

    const data = {
      cameras: cameras.map((c) => c.camera),
      lenses: lenses.map((l) => l.lens),
      isoValues: isoValues.map((i) => i.iso),
      apertureValues: apertureValues.map((a) => a.aperture),
      dates: dates.map((d) => d.date),
      dateCounts,
      keywords: keywordRows.map((r) => r.value),
      labels: labels.map((l) => l.label),
    };

    metadataCache = { data, timestamp: Date.now() };
    res.json(data);
  } catch (error) {
    console.error('Error fetching metadata:', error);
    res.status(500).json({ error: 'Failed to fetch metadata' });
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
