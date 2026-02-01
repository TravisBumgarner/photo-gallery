# Stats Page Design

## Overview

Add a dedicated Stats page to the photo gallery that presents 10 interactive charts visualizing photo collection data. The page includes filter controls for camera, date range, ISO, aperture, and lens to let users slice the data interactively.

## Navigation

The app currently has no URL routing. Add `react-router-dom` to enable navigation between the Gallery (existing page) and the new Stats page. A minimal navigation bar or tab switcher in the existing Toolbar area will allow switching between views.

## Charting Library

Use **Recharts** (`recharts`) — a React-native charting library built on D3. It integrates well with MUI theming, supports responsive containers, and has a small API surface. It renders SVG so it will match the dark theme cleanly.

## Backend API

### `GET /api/photos/stats`

A single endpoint that returns all aggregated statistics. Accepts the same filter query parameters as `GET /api/photos` (camera, lens, minIso, maxIso, minAperture, maxAperture, startDate, endDate, rating, label, keyword, folder). The endpoint computes all aggregations server-side and returns them in one response.

**Request query params:** Same as `photoFiltersSchema` (minus `page`, `limit`, `sortBy`, `sortOrder`).

**Response shape:**

```json
{
  "totalPhotos": 18432,
  "photosOverTime": [
    { "month": "2024-01", "count": 342 }
  ],
  "cameraDistribution": [
    { "camera": "NIKON Z 6_2", "count": 5200 }
  ],
  "lensDistribution": [
    { "lens": "NIKKOR Z 50mm f/1.8 S", "count": 3100 }
  ],
  "focalLengthDistribution": [
    { "focalLength": 50, "count": 3100 }
  ],
  "apertureDistribution": [
    { "aperture": 1.8, "count": 2400 }
  ],
  "isoDistribution": [
    { "iso": 100, "count": 4500 }
  ],
  "aspectRatioDistribution": [
    { "aspectRatio": "3:2", "count": 12000 }
  ],
  "ratingDistribution": [
    { "rating": 0, "count": 8000 },
    { "rating": 1, "count": 1200 }
  ],
  "shutterSpeedDistribution": [
    { "shutterSpeed": "1/250", "count": 1800 }
  ],
  "photosByDayOfWeek": [
    { "day": "Monday", "count": 2100 }
  ],
  "photosByHourOfDay": [
    { "hour": 0, "count": 50 }
  ]
}
```

## Charts (10 total)

1. **Photos Over Time** — Area chart. Monthly photo counts. Shows shooting activity trends.
2. **Camera Body Distribution** — Horizontal bar chart. Count per camera model.
3. **Lens Distribution** — Horizontal bar chart. Count per lens.
4. **Focal Length Distribution** — Bar chart. Histogram of focal lengths (grouped into bins: 14-24, 24-35, 35-50, 50-85, 85-135, 135-200, 200+).
5. **Aperture Distribution** — Bar chart. Count per aperture value (f/1.4, f/1.8, f/2.8, etc.).
6. **ISO Distribution** — Bar chart. Count per ISO value (100, 200, 400, 800, etc.).
7. **Aspect Ratio Distribution** — Pie/donut chart. Proportion of 3:2, 4:5, 1:1, 16:9, etc.
8. **Rating Distribution** — Bar chart. Count per star rating (0-5).
9. **Shutter Speed Distribution** — Bar chart. Count per shutter speed value.
10. **Shooting Time Heatmap** — Two charts: bar chart of photos by day of week, and bar chart of photos by hour of day (24h).

## Stats Filter Panel

A horizontal filter bar at the top of the stats page with:
- Camera dropdown (multi-select)
- Lens dropdown (multi-select)
- Date range picker (start/end date inputs)
- ISO range (min/max inputs)
- Aperture range (min/max inputs)
- Rating minimum (star selector)
- Clear all filters button

Filters are applied as query params to the `/api/photos/stats` endpoint. The charts update when filters change (debounced).

## Shared Types

Add `StatsFilters` and `StatsResponse` types to `shared/src/types.ts`. Add a Zod validation schema `statsFiltersSchema` to `shared/src/schemas.ts`.

## UI/UX

- Dark theme consistent with existing gallery
- Responsive: charts stack vertically on mobile, 2-column grid on desktop
- Each chart is in a card with a title
- Loading skeleton while data fetches
- Summary stat cards at top (total photos, date range, unique cameras, unique lenses)
