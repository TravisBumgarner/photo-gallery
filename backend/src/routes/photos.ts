import {
  type AnyColumn,
  and,
  asc,
  desc,
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

    // Filter by aspect ratio (supports comma-separated multi-select)
    if (aspectRatio) {
      const ratios = aspectRatio.split(',').filter(Boolean);
      const ratioConditions = ratios.map((r) => {
        const ratio = parseFloat(r);
        const tolerance = 0.1;
        return and(
          gte(photos.aspectRatio, ratio - tolerance),
          lte(photos.aspectRatio, ratio + tolerance),
        );
      });
      if (ratioConditions.length === 1) {
        conditions.push(ratioConditions[0]);
      } else if (ratioConditions.length > 1) {
        conditions.push(or(...ratioConditions));
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
      const segments = folder.split('/');
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

    // Execute query
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const allPhotos = await db
      .select()
      .from(photos)
      .where(whereClause)
      .orderBy(orderFn(orderByColumn))
      .limit(limitNum)
      .offset(offset);

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(photos)
      .where(whereClause);
    const total = countResult[0]?.count || 0;

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

// Get unique cameras
router.get('/photos/meta/cameras', async (_req, res) => {
  try {
    const cameras = await db
      .selectDistinct({ camera: photos.camera })
      .from(photos)
      .where(sql`${photos.camera} IS NOT NULL`)
      .orderBy(asc(photos.camera));

    res.json(cameras.map((c) => c.camera));
  } catch (error) {
    console.error('Error fetching cameras:', error);
    res.status(500).json({ error: 'Failed to fetch cameras' });
  }
});

// Get unique lenses
router.get('/photos/meta/lenses', async (_req, res) => {
  try {
    const lenses = await db
      .selectDistinct({ lens: photos.lens })
      .from(photos)
      .where(sql`${photos.lens} IS NOT NULL`)
      .orderBy(asc(photos.lens));

    res.json(lenses.map((l) => l.lens));
  } catch (error) {
    console.error('Error fetching lenses:', error);
    res.status(500).json({ error: 'Failed to fetch lenses' });
  }
});

// Get photo statistics
router.get('/photos/meta/stats', async (_req, res) => {
  try {
    const stats = await db
      .select({
        total: sql<number>`count(*)`,
        minIso: sql<number>`min(${photos.iso})`,
        maxIso: sql<number>`max(${photos.iso})`,
        minAperture: sql<number>`min(${photos.aperture})`,
        maxAperture: sql<number>`max(${photos.aperture})`,
        minDate: sql<string>`min(${photos.dateCaptured})`,
        maxDate: sql<string>`max(${photos.dateCaptured})`,
      })
      .from(photos);

    res.json(stats[0]);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Get distinct ISO values
router.get('/photos/meta/iso-values', async (_req, res) => {
  try {
    const isoValues = await db
      .selectDistinct({ iso: photos.iso })
      .from(photos)
      .where(sql`${photos.iso} IS NOT NULL`)
      .orderBy(asc(photos.iso));

    res.json(isoValues.map((i) => i.iso));
  } catch (error) {
    console.error('Error fetching ISO values:', error);
    res.status(500).json({ error: 'Failed to fetch ISO values' });
  }
});

// Get distinct aperture values
router.get('/photos/meta/aperture-values', async (_req, res) => {
  try {
    const apertureValues = await db
      .selectDistinct({ aperture: photos.aperture })
      .from(photos)
      .where(sql`${photos.aperture} IS NOT NULL`)
      .orderBy(asc(photos.aperture));

    res.json(apertureValues.map((a) => a.aperture));
  } catch (error) {
    console.error('Error fetching aperture values:', error);
    res.status(500).json({ error: 'Failed to fetch aperture values' });
  }
});

// Get distinct dates (date only, no time)
router.get('/photos/meta/dates', async (_req, res) => {
  try {
    const dates = await db
      .selectDistinct({
        date: sql<string>`DATE(${photos.dateCaptured}, 'unixepoch')`,
      })
      .from(photos)
      .where(sql`${photos.dateCaptured} IS NOT NULL`)
      .orderBy(desc(sql`DATE(${photos.dateCaptured}, 'unixepoch')`));

    res.json(dates.map((d) => d.date));
  } catch (error) {
    console.error('Error fetching dates:', error);
    res.status(500).json({ error: 'Failed to fetch dates' });
  }
});

// Get dates with photo counts (for calendar view)
router.get('/photos/meta/dates-with-counts', async (_req, res) => {
  try {
    const dateGroups = await db
      .select({
        date: sql<string>`DATE(date_captured, 'unixepoch')`,
        count: sql<number>`count(*)`,
      })
      .from(photos)
      .where(sql`${photos.dateCaptured} IS NOT NULL`)
      .groupBy(sql`DATE(date_captured, 'unixepoch')`)
      .orderBy(desc(sql`DATE(date_captured, 'unixepoch')`));

    res.json(dateGroups);
  } catch (error) {
    console.error('Error fetching date counts:', error);
    res.status(500).json({ error: 'Failed to fetch date counts' });
  }
});

// Get distinct label values
router.get('/photos/meta/labels', async (_req, res) => {
  try {
    const labels = await db
      .selectDistinct({ label: photos.label })
      .from(photos)
      .where(sql`${photos.label} IS NOT NULL`)
      .orderBy(asc(photos.label));

    res.json(labels.map((l) => l.label));
  } catch (error) {
    console.error('Error fetching labels:', error);
    res.status(500).json({ error: 'Failed to fetch labels' });
  }
});

// Get distinct keywords
router.get('/photos/meta/keywords', async (_req, res) => {
  try {
    const rows = await db
      .select({ keywords: photos.keywords })
      .from(photos)
      .where(sql`${photos.keywords} IS NOT NULL`);

    const keywordSet = new Set<string>();
    rows.forEach((row) => {
      if (row.keywords) {
        try {
          const parsed = JSON.parse(row.keywords);
          if (Array.isArray(parsed)) {
            parsed.forEach((kw: string) => keywordSet.add(kw));
          }
        } catch (_e) {
          // Skip invalid JSON
        }
      }
    });

    const sorted = Array.from(keywordSet).sort((a, b) => a.localeCompare(b));
    res.json(sorted);
  } catch (error) {
    console.error('Error fetching keywords:', error);
    res.status(500).json({ error: 'Failed to fetch keywords' });
  }
});

// Get distinct folder paths derived from keywords
router.get('/photos/meta/folders', async (_req, res) => {
  try {
    const rows = await db
      .select({ keywords: photos.keywords })
      .from(photos)
      .where(sql`${photos.keywords} IS NOT NULL`);

    const pathSet = new Set<string>();
    rows.forEach((row) => {
      if (row.keywords) {
        try {
          const parsed = JSON.parse(row.keywords);
          if (Array.isArray(parsed)) {
            // Build all ancestor paths
            for (let i = 1; i <= parsed.length; i++) {
              pathSet.add(parsed.slice(0, i).join('/'));
            }
          }
        } catch (_e) {
          // Skip invalid JSON
        }
      }
    });

    const sorted = Array.from(pathSet).sort((a, b) => a.localeCompare(b));
    res.json(sorted);
  } catch (error) {
    console.error('Error fetching folders:', error);
    res.status(500).json({ error: 'Failed to fetch folders' });
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
