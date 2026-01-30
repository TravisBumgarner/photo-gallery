import { Router } from 'express';
import { db } from '../db/index.js';
import { photos } from '../db/schema.js';
import { sql, desc, asc, or, like, and, gte, lte, type AnyColumn } from 'drizzle-orm';

export const router = Router();

// Get photos with pagination, filters, and search
router.get('/photos', async (req, res) => {
  try {
    const {
      page = '1',
      limit = '20',
      search = '',
      camera = '',
      minIso = '',
      maxIso = '',
      minAperture = '',
      maxAperture = '',
      startDate = '',
      endDate = '',
      aspectRatio = '',
      rating = '',
      label = '',
      sortBy = 'dateCaptured',
      sortOrder = 'desc',
    } = req.query;

    console.log('Filter params:', { rating, label, search, camera });

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;

    // Build where conditions
    const conditions = [];

    // Search in filename and keywords
    if (search) {
      conditions.push(
        or(
          like(photos.filename, `%${search}%`),
          like(photos.keywords, `%${search}%`),
          like(photos.camera, `%${search}%`)
        )
      );
    }

    // Filter by camera
    if (camera) {
      conditions.push(like(photos.camera, `%${camera}%`));
    }

    // Filter by ISO range
    if (minIso) {
      conditions.push(gte(photos.iso, parseInt(minIso as string)));
    }
    if (maxIso) {
      conditions.push(lte(photos.iso, parseInt(maxIso as string)));
    }

    // Filter by aperture range
    if (minAperture) {
      conditions.push(gte(photos.aperture, parseFloat(minAperture as string)));
    }
    if (maxAperture) {
      conditions.push(lte(photos.aperture, parseFloat(maxAperture as string)));
    }

    // Filter by date range
    if (startDate) {
      const startTimestamp = Math.floor(new Date(startDate as string).getTime() / 1000);
      conditions.push(sql`${photos.dateCaptured} >= ${startTimestamp}`);
    }
    if (endDate) {
      const endTimestamp = Math.floor(new Date(endDate as string).getTime() / 1000) + 86399; // Add 23:59:59
      conditions.push(sql`${photos.dateCaptured} <= ${endTimestamp}`);
    }

    // Filter by aspect ratio
    if (aspectRatio) {
      const ratio = parseFloat(aspectRatio as string);
      const tolerance = 0.1; // Allow some variance for common aspect ratios
      conditions.push(
        and(
          gte(photos.aspectRatio, ratio - tolerance),
          lte(photos.aspectRatio, ratio + tolerance)
        )
      );
    }

    // Filter by rating
    if (rating) {
      conditions.push(sql`${photos.rating} >= ${parseInt(rating as string)}`);
    }

    // Filter by label
    if (label) {
      conditions.push(sql`${photos.label} = ${label}`);
    }

    // Determine sort column and order
    const validSortColumns: Record<string, AnyColumn> = {
      dateCaptured: photos.dateCaptured,
      filename: photos.filename,
      rating: photos.rating,
      createdAt: photos.createdAt,
    };
    const orderFn = sortOrder === 'asc' ? asc : desc;
    const orderByColumn = validSortColumns[sortBy as string] ?? photos.dateCaptured;

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
      .where(and(
        sql`${photos.camera} IS NOT NULL`,
        like(photos.camera, `%${searchTerm}%`)
      ))
      .limit(5);

    // Get matching keywords
    const keywordMatches = await db
      .selectDistinct({ value: photos.keywords })
      .from(photos)
      .where(and(
        sql`${photos.keywords} IS NOT NULL`,
        like(photos.keywords, `%${searchTerm}%`)
      ))
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
        } catch (e) {
          // Skip invalid JSON
        }
      }
    });

    // Combine all suggestions
    const suggestions = [
      ...filenameMatches.map(f => f.value),
      ...cameraMatches.map(c => c.value),
      ...Array.from(keywords).slice(0, 10),
    ].filter(Boolean).slice(0, 20);

    res.json(suggestions);
  } catch (error) {
    console.error('Error fetching autocomplete suggestions:', error);
    res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

// Get grouped suggestions for search (when focused)
router.get('/photos/suggestions', async (req, res) => {
  try {
    // Get top cameras
    const topCameras = await db
      .select({ 
        value: photos.camera,
        count: sql<number>`count(*) as count`
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
        } catch (e) {
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
      cameras: topCameras.map(c => c.value),
      keywords: topKeywords,
      files: recentFiles.map(f => f.value),
    });
  } catch (error) {
    console.error('Error fetching suggestions:', error);
    res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

// Get unique cameras
router.get('/photos/meta/cameras', async (req, res) => {
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

// Get photo statistics
router.get('/photos/meta/stats', async (req, res) => {
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
router.get('/photos/meta/iso-values', async (req, res) => {
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
router.get('/photos/meta/aperture-values', async (req, res) => {
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
router.get('/photos/meta/dates', async (req, res) => {
  try {
    const dates = await db
      .selectDistinct({ 
        date: sql<string>`DATE(${photos.dateCaptured}, 'unixepoch')` 
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
router.get('/photos/meta/dates-with-counts', async (req, res) => {
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
router.get('/photos/meta/labels', async (req, res) => {
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
